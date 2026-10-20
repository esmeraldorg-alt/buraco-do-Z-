// Cadastro e login por apelido + senha
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ApelidoEmUso, type Armazenamento, type Usuario } from './armazenamento';

export class ErroAuth extends Error {}

export function gerarHash(senha: string): string {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(senha, sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

export function conferirSenha(senha: string, guardado: string): boolean {
  const [sal, hash] = guardado.split(':');
  const calculado = scryptSync(senha, sal, 64);
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === calculado.length && timingSafeEqual(esperado, calculado);
}

export function validarApelido(apelido: unknown): string {
  if (typeof apelido !== 'string') throw new ErroAuth('Informe um apelido');
  const a = apelido.trim();
  if (a.length < 2 || a.length > 20) throw new ErroAuth('O apelido precisa ter de 2 a 20 caracteres');
  if (!/^[\p{L}\p{N} _.-]+$/u.test(a)) throw new ErroAuth('Use só letras, números, espaço, ponto, hífen ou _');
  return a;
}

export function validarSenha(senha: unknown): string {
  if (typeof senha !== 'string' || senha.length < 4) throw new ErroAuth('A senha precisa ter pelo menos 4 caracteres');
  if (senha.length > 100) throw new ErroAuth('Senha muito longa');
  return senha;
}

export async function cadastrar(db: Armazenamento, apelido: unknown, senha: unknown): Promise<{ usuario: Usuario; token: string }> {
  const a = validarApelido(apelido);
  const s = validarSenha(senha);
  if (await db.buscarPorApelido(a)) throw new ErroAuth('Esse apelido já está em uso');
  let usuario: Usuario;
  try {
    usuario = await db.criarUsuario(a, gerarHash(s));
  } catch (e) {
    if (e instanceof ApelidoEmUso) throw new ErroAuth('Esse apelido já está em uso');
    throw e;
  }
  const token = randomBytes(24).toString('hex');
  await db.criarSessao(token, usuario.id);
  return { usuario, token };
}

export async function entrar(db: Armazenamento, apelido: unknown, senha: unknown): Promise<{ usuario: Usuario; token: string }> {
  if (typeof apelido !== 'string' || typeof senha !== 'string') throw new ErroAuth('Informe apelido e senha');
  const u = await db.buscarPorApelido(apelido.trim());
  if (!u || !conferirSenha(senha, u.senhaHash)) throw new ErroAuth('Apelido ou senha incorretos');
  const token = randomBytes(24).toString('hex');
  await db.criarSessao(token, u.id);
  return { usuario: { id: u.id, apelido: u.apelido }, token };
}
