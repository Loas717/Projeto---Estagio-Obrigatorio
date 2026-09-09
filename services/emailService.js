const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

async function enviarCertificadoPorEmail({ to, nomeAluno, curso, ra, ipfsLink, credential }) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.warn('[EMAIL] SMTP não configurado. E-mail não enviado. Defina SMTP_HOST, SMTP_USER, SMTP_PASS e EMAIL_FROM no .env.');
        return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
    }

    const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(credential || {}, null, 2), {
        errorCorrectionLevel: 'M',
        width: 240,
        margin: 1,
        type: 'image/png',
    });

    const jsonContent = JSON.stringify(credential || {}, null, 2);
    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    });

    const assunto = `Seu diploma foi emitido - ${nomeAluno}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #111827; background: #f9fafb; padding: 24px; border-radius: 12px;">
            <div style="background: linear-gradient(135deg, #0f172a, #1d4ed8); padding: 24px; border-radius: 12px; color: #ffffff; margin-bottom: 24px;">
                <h1 style="margin: 0; font-size: 28px;">Diploma emitido com sucesso</h1>
                <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Olá, ${nomeAluno}</p>
            </div>

            <p style="font-size: 16px; line-height: 1.6; margin-bottom: 16px;">
                Seu certificado do curso <strong>${curso}</strong> foi emitido e registrado com segurança na blockchain.
            </p>

            <div style="background: #ffffff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0;">
                <p style="margin: 0 0 16px; font-weight: 700; font-size: 18px; color: #111827;">QR Code da credencial</p>
                <img src="${qrCodeDataUrl}" alt="QR Code do certificado" style="width: 240px; height: 240px; border-radius: 12px; background: #ffffff; padding: 12px; border: 1px solid #e5e7eb;" />
                <p style="margin: 16px 0 0; font-size: 14px; line-height: 1.5; color: #4b5563;">
                    Escaneie este QR Code para salvar a credencial no app da UniChain Wallet ou verificar a autenticidade do documento.
                </p>
            </div>

            <div style="margin: 20px 0; text-align: center;">
                <a href="cid:credential-json" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 700; margin-right: 8px;">
                    Baixar JSON
                </a>
                ${ipfsLink ? `<a href="${ipfsLink}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 700;">Abrir no IPFS</a>` : ''}
            </div>

            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 16px; font-size: 14px; color: #1e3a8a;">
                <strong>RA:</strong> ${ra}<br />
                <strong>Curso:</strong> ${curso}
            </div>
        </div>
    `;

    await transporter.sendMail({
        from: process.env.EMAIL_FROM || smtpUser,
        to,
        subject: assunto,
        html,
        attachments: [{
            filename: `diploma_${String(ra || 'aluno').replace(/\s+/g, '_')}.json`,
            content: jsonContent,
            contentType: 'application/json',
            cid: 'credential-json',
        }],
    });

    return { sent: true };
}

module.exports = { enviarCertificadoPorEmail };
