import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    const host = configService.get<string>('SMTP_HOST')?.trim();

    if (!host) {
      this.transporter = null;
      return;
    }

    const port = Number(configService.get<string>('SMTP_PORT')) || 587;
    const user = configService.get<string>('SMTP_USER')?.trim();
    const password = configService.get<string>('SMTP_PASSWORD')?.trim();

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && password ? { user, pass: password } : undefined,
    });
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    if (!this.transporter) {
      if (
        this.configService.get<string>('NODE_ENV') !== 'production' &&
        this.configService
          .get<string>('PASSWORD_RESET_EXPOSE_TOKEN')
          ?.toLowerCase() === 'true'
      ) {
        this.logger.warn(`Link local de recuperacao: ${resetUrl}`);
        return;
      }

      throw new Error('SMTP nao configurado.');
    }

    await this.transporter.sendMail({
      from:
        this.configService.get<string>('SMTP_FROM')?.trim() ||
        'Dead Idle <no-reply@dead-idle.invalid>',
      to: email,
      subject: 'Recuperacao de acesso - Dead Idle',
      text: [
        'Recebemos uma solicitacao para redefinir sua senha.',
        `Abra este link em ate 30 minutos: ${resetUrl}`,
        'Se voce nao solicitou a alteracao, ignore esta mensagem.',
      ].join('\n\n'),
      html: `<p>Recebemos uma solicitacao para redefinir sua senha.</p><p><a href="${resetUrl}">Redefinir senha</a></p><p>O link expira em 30 minutos. Se voce nao solicitou a alteracao, ignore esta mensagem.</p>`,
    });
  }
}
