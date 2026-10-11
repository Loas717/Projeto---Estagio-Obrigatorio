pragma solidity ^0.8.0;

contract InstitutionRegistryBR {
    address public institutionAdmin;

    struct Instituicao {
        string nome;
        bool ativa;
        bool registrada;
    }

    mapping(address => Instituicao) public instituicoes;

    modifier apenasAdmin() {
        require(msg.sender == institutionAdmin, "Apenas o administrador pode executar esta acao");
        _;
    }

    constructor() {
        institutionAdmin = msg.sender;
    }

    function credenciarInstituicao(address _carteira, string memory _nome) public apenasAdmin {
        instituicoes[_carteira] = Instituicao(_nome, true, true);
    }

    function revogarInstituicao(address _carteira) public apenasAdmin {
        require(instituicoes[_carteira].registrada, "Instituicao nao existe");
        instituicoes[_carteira].ativa = false;
    }

    function validarEmissor(address _carteira) public view returns (bool, string memory) {
        if (!instituicoes[_carteira].registrada || !instituicoes[_carteira].ativa) {
            return (false, "Instituicao Nao Reconhecida ou Inativa");
        }
        return (true, instituicoes[_carteira].nome);
    }
}