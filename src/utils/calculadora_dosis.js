const DOSIS_POR_EDAD = {
  '1_anio': {
    label: 'Café Tiernito (1 año)',
    dosisAnual: '1 - 2 onzas',
    aplicaciones: 2,
    porAplicacion: { onzas: 1, gramos: 28, fraccion: 0.25, vasitoLabel: '1/4 de vasito' }
  },
  '2_anios': {
    label: 'Café Creciendo (2 años)',
    dosisAnual: '2 - 3 onzas',
    aplicaciones: 2,
    porAplicacion: { onzas: 2, gramos: 57, fraccion: 0.5, vasitoLabel: 'Medio vasito' }
  },
  '3_mas': {
    label: 'Café en Producción (3+ años)',
    dosisAnual: '4 onzas',
    aplicaciones: 3,
    porAplicacion: { onzas: 1.33, gramos: 38, fraccion: 0.33, vasitoLabel: 'Un poquito menos de medio vasito' }
  },
  'carga_alta': {
    label: 'Café con Carga Muy Alta',
    dosisAnual: '6 onzas',
    aplicaciones: 3,
    porAplicacion: { onzas: 2, gramos: 57, fraccion: 0.5, vasitoLabel: 'Medio vasito copón' }
  }
};

const PLAN_IFCAFE_ZONA_A = [
  { mes: 5,  mesLabel: 'Mayo',     tipo: 'Suelo',  producto: 'Fórmula Completa (15-15-15 o 18-6-12)',     recomendacion: '1ra abonada — para las ramas nuevas' },
  { mes: 6,  mesLabel: 'Junio',    tipo: 'Foliar', producto: 'Zinc + Boro',                                  recomendacion: '1ra rociada — para asegurar que pegue la flor' },
  { mes: 8,  mesLabel: 'Agosto',   tipo: 'Suelo',  producto: 'Fórmula Completa (15-15-15 o 18-6-12)',       recomendacion: '2da abonada — para mantener el grano creciendo' },
  { mes: 8,  mesLabel: 'Agosto',   tipo: 'Foliar', producto: 'Magnesio y menores',                          recomendacion: '2da rociada — para mantener las hojas verdes' },
  { mes: 10, mesLabel: 'Octubre',  tipo: 'Suelo',  producto: 'Fórmula alta en Potasio (12-12-17)',          recomendacion: '3ra abonada — para que el grano pese más' },
];

const PLAN_IFCAFE_ZONA_B = [
  { mes: 6,  mesLabel: 'Junio',    tipo: 'Suelo',  producto: 'Fórmula Completa (15-15-15 o 18-6-12)',   recomendacion: '1ra abonada — esperando que caliente el suelo' },
  { mes: 7,  mesLabel: 'Julio',    tipo: 'Foliar', producto: 'Zinc + Boro',                               recomendacion: '1ra rociada — para la flor' },
  { mes: 9,  mesLabel: 'Septiembre', tipo: 'Suelo',  producto: 'Fórmula Completa (15-15-15 o 18-6-12)',  recomendacion: '2da abonada — para sostener la carga' },
  { mes: 9,  mesLabel: 'Septiembre', tipo: 'Foliar', producto: 'Magnesio y menores',                      recomendacion: '2da rociada — para la salud de la hoja' },
  { mes: 11, mesLabel: 'Noviembre', tipo: 'Suelo',  producto: 'Fórmula alta en Potasio (12-12-17)',      recomendacion: '3ra abonada — antes del frío fuerte para ganar peso' },
];

export function getDosisPorEdad(edadCategoria) {
  return DOSIS_POR_EDAD[edadCategoria] || DOSIS_POR_EDAD['3_mas'];
}

export function getPlanIfcafe(alturaMsnm) {
  return (!alturaMsnm || alturaMsnm < 1000) ? PLAN_IFCAFE_ZONA_A : PLAN_IFCAFE_ZONA_B;
}

export function getZonaLabel(alturaMsnm) {
  return (!alturaMsnm || alturaMsnm < 1000)
    ? 'A — Zonas bajas/medias (menos de 1,000 msnm)'
    : 'B — Zonas altas / Estricta Altura (más de 1,200 msnm)';
}

export function calcularDosis(edadCategoria, numPlantas) {
  const dosis = getDosisPorEdad(edadCategoria);
  const porPlanta = dosis.porAplicacion;
  const totalOnzasPorAplicacion = porPlanta.onzas * numPlantas;
  const totalKgPorAplicacion = (totalOnzasPorAplicacion * 28.35) / 1000;
  const onzasPorSaco = 16 * 2.20462 * 16;
  const sacos = Math.ceil((totalKgPorAplicacion * 2.20462 * 16) / (onzasPorSaco || 3200));

  return {
    ...dosis,
    numPlantas,
    totalOnzasPorAplicacion: Math.round(totalOnzasPorAplicacion),
    totalKgPorAplicacion: Math.round(totalKgPorAplicacion * 10) / 10,
    sacosNecesarios: sacos || 1,
  };
}

export function obtenerOrdenDia(loteNombre, producto, dosisCalculada, operarios) {
  const dosis = dosisCalculada.porAplicacion;
  const opText = operarios && operarios.length > 0
    ? operarios.join(', ')
    : 'el operario asignado';

  return `${opText}, hoy nos toca abonar el lote '${loteNombre}'. A cada planta le vas a echar ${dosis.vasitoLabel} de ${producto}, bien distribuido abajo de la sombra de las hojas. No apliques si mirás que la tierra está seca.`;
}