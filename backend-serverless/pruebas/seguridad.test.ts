import { describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { exigirRol, identidadDesdeEvento } from "../src/compartido/seguridad.js";

function evento(claims?: Record<string, unknown>): APIGatewayProxyEventV2 {
  return { requestContext: { authorizer: claims ? { jwt: { claims } } : undefined } } as unknown as APIGatewayProxyEventV2;
}

describe("identidad Cognito validada", () => {
  it("deriva exclusivamente sub y un rol", () => {
    expect(identidadDesdeEvento(evento({ sub: "abc", "cognito:groups": "[\"PROFESOR\"]", email: "ignorado@udd.cl" })))
      .toEqual({ sub: "abc", rol: "PROFESOR" });
  });

  it.each([
    [undefined, 401],
    [{ sub: "abc" }, 403],
    [{ sub: "abc", "cognito:groups": "[\"PROFESOR\",\"GRUPO\"]" }, 403],
  ])("rechaza claims ausentes o ambiguos", (claims, estadoHttp) => {
    expect(() => identidadDesdeEvento(evento(claims))).toThrowError(expect.objectContaining({ estado: estadoHttp }));
  });

  it("rechaza cruce de rol", () => {
    expect(() => exigirRol(evento({ sub: "g", "cognito:groups": "GRUPO" }), "PROFESOR"))
      .toThrowError(expect.objectContaining({ estado: 403 }));
  });
});
