import { beforeEach, describe, expect, it } from "vitest";

import type { IntentoFoto, PuertoFotografias } from "./servicio.js";
import { ServicioFotografias } from "./servicio.js";

class RepoMemoria implements PuertoFotografias {
  items = new Map<string, IntentoFoto>(); efectos = 0;
  async crear(item: IntentoFoto) { this.items.set(item.trabajoId, item); }
  async obtener(id: string) { return this.items.get(id) ?? null; }
  async registrarVersionYEncolar(d: { trabajoId: string; intentoId: string; bucket: string; key: string; versionId: string }) {
    const item = this.items.get(d.trabajoId)!;
    if (item.versionId) return item.versionId === d.versionId ? "DUPLICADO" as const : "VERSION_CONFLICTIVA" as const;
    item.versionId = d.versionId; item.estado = "ENCOLADO"; return "NUEVO" as const;
  }
  async adquirirLease(id: string, _intento: string, hasta: string) { const item = this.items.get(id)!; if (item.estado !== "ENCOLADO") return false; item.estado = "PROCESANDO"; item.leaseUntil = hasta; return true; }
  async completar(id: string, _intento: string, _efecto: Record<string, unknown>) { const item = this.items.get(id)!; if (item.estado === "PROCESANDO") { item.estado = "COMPLETADO"; this.efectos += 1; } }
  async fallar(id: string, _intento: string, causa: string, estado: "FALLIDO" | "EXPIRADO" = "FALLIDO") { const item = this.items.get(id)!; item.estado = estado; item.causa = causa; return true; }
  async listarVencidos() { return [...this.items.values()].filter((i) => i.estado === "PENDIENTE_CARGA"); }
}

const reloj = () => new Date("2026-08-16T12:00:00.000Z");
const firmador = { firmar: async () => "https://carga.privada.example/firmada" };

describe("hexágono fotográfico", () => {
  beforeEach(() => { process.env.CARGAS_FOTOGRAFIAS_HABILITADAS = "true"; });
  it("inicia JPEG/PNG válido con clave inmutable sin revelar bucket", async () => {
    const repo = new RepoMemoria(); const servicio = new ServicioFotografias(repo, firmador, reloj);
    const salida = await servicio.iniciar({ sesionId: "s1", grupoId: "g1" }, { mime: "image/jpeg", tamano: 1024 });
    expect(salida).toMatchObject({ trabajoId: expect.any(String), intentoId: expect.any(String), expiraEnSegundos: 300 });
    expect(JSON.stringify(salida)).not.toContain("bucket");
    expect((await repo.obtener(salida.trabajoId))?.clave).toBe(`entradas/s1/g1/${salida.trabajoId}/${salida.intentoId}`);
  });

  it("rechaza iniciar cuando las cargas están deshabilitadas", async () => {
    process.env.CARGAS_FOTOGRAFIAS_HABILITADAS = "false";
    await expect(new ServicioFotografias(new RepoMemoria(), firmador).iniciar({ sesionId: "s", grupoId: "g" }, { mime: "image/png", tamano: 2 })).rejects.toMatchObject({ estado: 503, codigo: "CARGAS_DESHABILITADAS" });
  });

  it.each([{ mime: "image/gif", tamano: 2 }, { mime: "image/png", tamano: 25 * 1024 * 1024 + 1 }])("rechaza MIME o tamaño inválido antes de persistir", async (entrada) => {
    const repo = new RepoMemoria(); await expect(new ServicioFotografias(repo, firmador).iniciar({ sesionId: "s", grupoId: "g" }, entrada)).rejects.toMatchObject({ estado: 422 }); expect(repo.items.size).toBe(0);
  });

  it("deduplica bucket/key/version, rechaza otra versión y produce un solo efecto", async () => {
    const repo = new RepoMemoria(); const servicio = new ServicioFotografias(repo, firmador); const creado = await servicio.iniciar({ sesionId: "s", grupoId: "g" }, { mime: "image/png", tamano: 2 }); const item = (await repo.obtener(creado.trabajoId))!;
    const datos = { trabajoId: creado.trabajoId, intentoId: creado.intentoId, bucket: "privado", key: item.clave, versionId: "v1" };
    expect(await repo.registrarVersionYEncolar(datos)).toBe("NUEVO"); expect(await repo.registrarVersionYEncolar(datos)).toBe("DUPLICADO"); expect(await repo.registrarVersionYEncolar({ ...datos, versionId: "v2" })).toBe("VERSION_CONFLICTIVA");
    expect(await repo.adquirirLease(creado.trabajoId, creado.intentoId, "mañana")).toBe(true); await repo.completar(creado.trabajoId, creado.intentoId, {}); expect(await repo.adquirirLease(creado.trabajoId, creado.intentoId, "mañana")).toBe(false); expect(repo.efectos).toBe(1);
  });

  it("proyecta estados educativos y oculta trabajos fuera del alcance", async () => {
    const repo = new RepoMemoria(); const servicio = new ServicioFotografias(repo, firmador); const creado = await servicio.iniciar({ sesionId: "s", grupoId: "g" }, { mime: "image/png", tamano: 2 });
    expect(await servicio.consultar(creado.trabajoId, { sesionId: "s", grupoId: "g" })).toMatchObject({ estado: "RECIBIDA" });
    await expect(servicio.consultar(creado.trabajoId, { sesionId: "s", grupoId: "otro" })).rejects.toMatchObject({ estado: 404 });
    await repo.fallar(creado.trabajoId, creado.intentoId, "interno"); const salida = await servicio.consultar(creado.trabajoId, { sesionId: "s" }); expect(salida.estado).toBe("FALLIDA"); expect(salida).not.toHaveProperty("causa");
  });

  it("solo recupera fallos con un intento nuevo enlazado y limita reintentos", async () => {
    const repo = new RepoMemoria(); const servicio = new ServicioFotografias(repo, firmador); const creado = await servicio.iniciar({ sesionId: "s", grupoId: "g" }, { mime: "image/png", tamano: 2 });
    await expect(servicio.reintentar(creado.trabajoId, "s", "profesor")).rejects.toMatchObject({ estado: 409 }); await repo.fallar(creado.trabajoId, creado.intentoId, "agotado"); const nuevo = await servicio.reintentar(creado.trabajoId, "s", "profesor"); const item = await repo.obtener(creado.trabajoId); expect(nuevo.intentoId).not.toBe(creado.intentoId); expect(item?.intentoAnteriorId).toBe(creado.intentoId); expect(item?.creadoPorSub).toBe("profesor");
    item!.estado = "FALLIDO"; item!.numeroIntento = 3; await expect(servicio.reintentar(creado.trabajoId, "s", "profesor")).rejects.toMatchObject({ codigo: "LIMITE_INTENTOS" });
  });

  it("un reintento no hereda claves físicas ni sobrescribe el intento anterior", async () => {
    const repo = new RepoMemoria(); const servicio = new ServicioFotografias(repo, firmador); const creado = await servicio.iniciar({ sesionId: "s", grupoId: "g" }, { mime: "image/png", tamano: 2 });
    const anterior = (await repo.obtener(creado.trabajoId))!; const snapshot = { ...anterior };
    Object.assign(anterior, { PK: "FISICA", SK: "FISICA", GSI1PK: "FISICA", tipo: "FISICO", schemaVersion: "viejo" }); anterior.estado = "FALLIDO";
    let nuevo: Record<string, unknown> | undefined; const crear = repo.crear.bind(repo); repo.crear = async (item) => { nuevo = item as unknown as Record<string, unknown>; await crear(item); };
    await servicio.reintentar(creado.trabajoId, "s", "profesor");
    expect(nuevo).not.toHaveProperty("PK"); expect(nuevo).not.toHaveProperty("SK"); expect(nuevo).not.toHaveProperty("GSI1PK"); expect(nuevo).not.toHaveProperty("tipo"); expect(nuevo).not.toHaveProperty("schemaVersion");
    expect(snapshot.intentoId).toBe(creado.intentoId);
  });
});
