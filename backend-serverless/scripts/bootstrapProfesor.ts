import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";

const [correoArgumento] = process.argv.slice(2);
const correo = correoArgumento?.trim().toLowerCase();
const poolId = process.env.COGNITO_PROFESORES_POOL_ID?.trim();
const claveTemporal = process.env.CLAVE_TEMPORAL_PROFESOR;

if (!correo || !correo.includes("@") || !poolId || !claveTemporal) {
  throw new Error(
    "Uso: COGNITO_PROFESORES_POOL_ID=<pool> CLAVE_TEMPORAL_PROFESOR=<secreto> npm run bootstrap:profesor -- correo@udd.cl",
  );
}

async function principal(): Promise<void> {
  const cliente = new CognitoIdentityProviderClient({});

  try {
    await cliente.send(new AdminCreateUserCommand({
    UserPoolId: poolId,
    Username: correo,
    TemporaryPassword: claveTemporal,
    MessageAction: "SUPPRESS",
    UserAttributes: [{ Name: "email", Value: correo }, { Name: "email_verified", Value: "true" }],
    }));
  } catch (error) {
    if ((error as { name?: string }).name !== "UsernameExistsException") throw error;
  }

  await cliente.send(new AdminAddUserToGroupCommand({
    UserPoolId: poolId,
    Username: correo,
    GroupName: "PROFESOR",
  }));

  process.stdout.write(`Profesor provisionado de forma idempotente: ${correo}\n`);
}

void principal();
