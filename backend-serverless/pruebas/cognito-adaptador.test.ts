import { beforeEach, describe, expect, it, vi } from "vitest";

const enviados: Array<{ constructor: { name: string }; input: Record<string, unknown> }> = [];
const respuestas: unknown[] = [];

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  class Comando {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    CognitoIdentityProviderClient: class {
      async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
        enviados.push(command);
        const respuesta = respuestas.shift();
        if (respuesta instanceof Error) throw respuesta;
        return respuesta ?? {};
      }
    },
    InitiateAuthCommand: class InitiateAuthCommand extends Comando {},
    RespondToAuthChallengeCommand: class RespondToAuthChallengeCommand extends Comando {},
    AdminCreateUserCommand: class AdminCreateUserCommand extends Comando {},
    AdminGetUserCommand: class AdminGetUserCommand extends Comando {},
    AdminSetUserPasswordCommand: class AdminSetUserPasswordCommand extends Comando {},
    AdminAddUserToGroupCommand: class AdminAddUserToGroupCommand extends Comando {},
    AdminUpdateUserAttributesCommand: class AdminUpdateUserAttributesCommand extends Comando {},
    AdminInitiateAuthCommand: class AdminInitiateAuthCommand extends Comando {},
  };
});

import {
  completarClaveProfesor,
  crearIdentidadGrupo,
  ingresarProfesorCognito,
  tokenGrupo,
} from "../src/compartido/cognito.js";

describe("adaptador Cognito real", () => {
  beforeEach(() => {
    enviados.length = 0;
    respuestas.length = 0;
    process.env.COGNITO_PROFESORES_CLIENT_ID = "cliente-profesores";
    process.env.COGNITO_GRUPOS_CLIENT_ID = "cliente-grupos";
    process.env.COGNITO_GRUPOS_POOL_ID = "pool-grupos";
  });

  it("usa USER_PASSWORD_AUTH y propaga NEW_PASSWORD_REQUIRED sin tokens", async () => {
    respuestas.push({ ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "challenge-session" });
    await expect(ingresarProfesorCognito("profe@udd.cl", "Temporal1!"))
      .resolves.toEqual({ challenge: "NEW_PASSWORD_REQUIRED", sesionChallenge: "challenge-session" });
    expect(enviados[0]).toMatchObject({
      input: { AuthFlow: "USER_PASSWORD_AUTH", ClientId: "cliente-profesores",
        AuthParameters: { USERNAME: "profe@udd.cl", PASSWORD: "Temporal1!" } },
    });
  });

  it("responde el challenge con cliente, sesión y contraseña nueva", async () => {
    respuestas.push({ AuthenticationResult: { AccessToken: "access" } });
    await expect(completarClaveProfesor("profe@udd.cl", "Nueva123!", "session"))
      .resolves.toEqual({ token: "access" });
    expect(enviados[0]).toMatchObject({ input: {
      ChallengeName: "NEW_PASSWORD_REQUIRED", ClientId: "cliente-profesores", Session: "session",
      ChallengeResponses: { USERNAME: "profe@udd.cl", NEW_PASSWORD: "Nueva123!" },
    } });
  });

  it("crea Grupo, fija password permanente, asigna rol y devuelve sub", async () => {
    respuestas.push({ User: { Attributes: [{ Name: "sub", Value: "sub-grupo" }] } }, {}, {});
    await expect(crearIdentidadGrupo("grupo-g1", "g1", "Codigo-aA1!"))
      .resolves.toEqual({ username: "grupo-g1", sub: "sub-grupo" });
    expect(enviados.map((comando) => comando.constructor.name)).toEqual([
      "AdminCreateUserCommand", "AdminSetUserPasswordCommand", "AdminAddUserToGroupCommand",
    ]);
    expect(enviados[0]!.input).toMatchObject({ UserPoolId: "pool-grupos", MessageAction: "SUPPRESS" });
    expect(enviados[1]!.input).toMatchObject({ Permanent: true });
    expect(enviados[2]!.input).toMatchObject({ GroupName: "GRUPO" });
  });

  it("rechaza UsernameExists si custom:grupoId pertenece a otro Grupo", async () => {
    const existe = Object.assign(new Error("existe"), { name: "UsernameExistsException" });
    respuestas.push(existe, { UserAttributes: [
      { Name: "sub", Value: "sub-viejo" }, { Name: "custom:grupoId", Value: "otro" },
    ] });
    await expect(crearIdentidadGrupo("grupo-g1", "g1", "Codigo-aA1!"))
      .rejects.toThrow("pertenece a otro Grupo");
    expect(enviados.map((comando) => comando.constructor.name)).toEqual([
      "AdminCreateUserCommand", "AdminGetUserCommand",
    ]);
  });

  it("intercambia credencial técnica con ADMIN_USER_PASSWORD_AUTH y client correcto", async () => {
    respuestas.push({ AuthenticationResult: { AccessToken: "grupo-token" } });
    await expect(tokenGrupo("grupo-g1", "Tecnica-aA1!")).resolves.toBe("grupo-token");
    expect(enviados[0]!.input).toMatchObject({
      UserPoolId: "pool-grupos", ClientId: "cliente-grupos", AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    });
  });
});
