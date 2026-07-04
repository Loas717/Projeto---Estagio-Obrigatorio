pragma solidity ^0.8.0;

contract RegistroAcademicoIPFS {
    address public admin;
    //CID pode não existir, pq é aonde o pdf está salvo (nem sempre é o caso)
    struct Certificado {
        bytes32 hashRa;
        string ipfsCID;
        bytes32 hashJson;
        uint256 dataRegistro;
        bool existe;
        bool revogado;
    }

    mapping(bytes32 => Certificado[]) private certificadosPorHashRA;
    mapping(string => Certificado) private certificadosPorCID;
    mapping(bytes32 => Certificado) private certificadosPorJson;

    event CertificadoRegistrado(bytes32 indexed hashRa, string cid, bytes32 hashJson);
    event CertificadoRevogado(bytes32 indexed hashJson, uint256 dataRevogacao);

    constructor(){
        admin = msg.sender;
    }

    modifier apenasAdmin() {
        require(msg.sender == admin, "Acesso negado.");
        _;
    }

    //_hash agora é _cid
    function registrar(bytes32 _hashRa, string memory _cid, bytes32 _hashJson) public apenasAdmin {
        //require(!certificadosPorHashRA[_hashRa].existe, "Erro: Este RA ja possui um diploma.");
        
        Certificado memory novoCert = Certificado({
            hashRa: _hashRa,
            ipfsCID: _cid,
            hashJson: _hashJson,
            dataRegistro: block.timestamp,
            existe: true,
            revogado: false
        });

        certificadosPorHashRA[_hashRa].push(novoCert);
        certificadosPorCID[_cid] = novoCert;
        certificadosPorJson[_hashJson] = novoCert;

        emit CertificadoRegistrado(_hashRa, _cid, _hashJson);
    }

    function consultar(bytes32 _hashRa) public view returns (Certificado[] memory) {
        return certificadosPorHashRA[_hashRa];
    }

    function verificarPorCID(string memory _cid) public view returns (bytes32 _hashRa, uint256 data) {
        Certificado memory cert = certificadosPorCID[_cid];
        return (cert.hashRa, cert.dataRegistro);
    }

    function verificarPorJson(bytes32 _hashJson) public view returns (bytes32 _hashRa, uint256 data, bool revogado) {
        Certificado memory cert = certificadosPorJson[_hashJson];
        return (cert.hashRa, cert.dataRegistro, cert.revogado);
    }

    function revogarCertificado(bytes32 _hashJson) public apenasAdmin {
        require(certificadosPorJson[_hashJson].existe, "Erro: Certificado nao encontrado.");
        require(!certificadosPorJson[_hashJson].revogado, "Erro: Certificado ja esta revogado.");

        bytes32 ra = certificadosPorJson[_hashJson].hashRa;
        string memory cid = certificadosPorJson[_hashJson].ipfsCID;

        certificadosPorJson[_hashJson].revogado = true;
        certificadosPorCID[cid].revogado = true;

        uint256 totalCertificados = certificadosPorHashRA[ra].length;
        for (uint256 i = 0; i < totalCertificados; i++) {
            if (certificadosPorHashRA[ra][i].hashJson == _hashJson) {
                certificadosPorHashRA[ra][i].revogado = true;
                break;
            }
        }

        emit CertificadoRevogado(_hashJson, block.timestamp);
    }
}