import {
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { ErrorAplicacion } from "./respuestas.js";

const cliente = new CognitoIdentityProviderClient({});

function requerido(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export function claveTecnicaGrupo(codigo: string, grupoId: string): string {
  return `${codigo}-${grupoId.replaceAll("-", "").slice(0, 20)}-aA1!`;
}

export interface ResultadoLogin {
  token?: string;
  refreshToken?: string;
  challenge?: "NEW_PASSWORD_REQUIRED";
  sesionChallenge?: string;
}

export async function ingresarProfesorCognito(
  usuario: string,
  clave: string,
): Promise<ResultadoLogin> {
  try {
    const resultado = await cliente.send(new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: requerido("COGNITO_PROFESORES_CLIENT_ID"),
      AuthParameters: { USERNAME: usuario, PASSWORD: clave },
    }));

    if (resultado.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      if (!resultado.Session) throw new Error("Cognito no devolvió sesión de challenge");
      return { challenge: "NEW_PASSWORD_REQUIRED", sesionChallenge: resultado.Session };
    }
    const token = resultado.AuthenticationResult?.AccessToken;
    if (!token) throw new Error("Cognito no emitió token");
    const salida: ResultadoLogin = { token };
    if (resultado.AuthenticationResult?.RefreshToken) {
      salida.refreshToken = resultado.AuthenticationResult.RefreshToken;
    }
    return salida;
  } catch {
    throw new ErrorAplicacion("No fue posible iniciar sesión", 401, "CREDENCIALES_INVALIDAS");
  }
}

export async function completarClaveProfesor(
  usuario: string,
  claveNueva: string,
  sesionChallenge: string,
): Promise<ResultadoLogin> {
  try {
    const resultado = await cliente.send(new RespondToAuthChallengeCommand({
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ClientId: requerido("COGNITO_PROFESORES_CLIENT_ID"),
      Session: sesionChallenge,
      ChallengeResponses: { USERNAME: usuario, NEW_PASSWORD: claveNueva },
    }));
    const token = resultado.AuthenticationResult?.AccessToken;
    if (!token) throw new Error("Cognito no emitió token");
    const salida: ResultadoLogin = { token };
    if (resultado.AuthenticationResult?.RefreshToken) {
      salida.refreshToken = resultado.AuthenticationResult.RefreshToken;
    }
    return salida;
  } catch {
    throw new ErrorAplicacion("No fue posible completar el primer acceso", 401, "CHALLENGE_INVALIDO");
  }
}

export async function crearIdentidadGrupo(
  username: string,
  grupoId: string,
  clave: string,
): Promise<{ username: string; sub: string }> {
  const pool = requerido("COGNITO_GRUPOS_POOL_ID");
  try {
    let sub: string | undefined;
    try {
      const creado = await cliente.send(new AdminCreateUserCommand({
      UserPoolId: pool,
      Username: username,
      MessageAction: "SUPPRESS",
      UserAttributes: [{ Name: "custom:grupoId", Value: grupoId }],
      }));
      sub = creado.User?.Attributes?.find((atributo) => atributo.Name === "sub")?.Value;
    } catch (error) {
      if ((error as { name?: string }).name !== "UsernameExistsException") throw error;
      const existente = await cliente.send(new AdminGetUserCommand({ UserPoolId: pool, Username: username }));
      sub = existente.UserAttributes?.find((atributo) => atributo.Name === "sub")?.Value;
      const grupoExistente = existente.UserAttributes?.find(
        (atributo) => atributo.Name === "custom:grupoId",
      )?.Value;
      if (grupoExistente !== grupoId) {
        throw new Error("La identidad Cognito existente pertenece a otro Grupo");
      }
    }
    await cliente.send(new AdminSetUserPasswordCommand({
      UserPoolId: pool,
      Username: username,
      Password: clave,
      Permanent: true,
    }));
    await cliente.send(new AdminAddUserToGroupCommand({
      UserPoolId: pool,
      Username: username,
      GroupName: "GRUPO",
    }));
    if (!sub) throw new Error("Cognito no devolvió sub");
    return { username, sub };
  } catch (error) {
    throw error;
  }
}

export async function actualizarVinculoGrupo(username: string, grupoId: string): Promise<void> {
  await cliente.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: requerido("COGNITO_GRUPOS_POOL_ID"),
    Username: username,
    UserAttributes: [{ Name: "custom:grupoId", Value: grupoId }],
  }));
}

export async function tokenGrupo(username: string, clave: string): Promise<string> {
  try {
    const resultado = await cliente.send(new AdminInitiateAuthCommand({
      UserPoolId: requerido("COGNITO_GRUPOS_POOL_ID"),
      ClientId: requerido("COGNITO_GRUPOS_CLIENT_ID"),
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: username, PASSWORD: clave },
    }));
    const token = resultado.AuthenticationResult?.AccessToken;
    if (!token) throw new Error("Cognito no emitió token");
    return token;
  } catch {
    throw new ErrorAplicacion("Código de grupo inválido", 401, "INGRESO_INVALIDO");
  }
}
