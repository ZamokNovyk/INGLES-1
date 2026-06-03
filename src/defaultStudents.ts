import { getAvatarUrl } from './utils';

export interface SeedStudent {
  id: string;
  nombre: string;
  género: 'hombres' | 'mujeres';
  elo: number;
  votos_ganados: number;
  votos_perdidos: number;
  perfilPhotoUrl: string;
}

export function normalizeNameId(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD') // Decompose combined characters to split accents
    .replace(/[\u0300-\u036f]/g, '') // Remove standard accents
    .replace(/ñ/g, 'n')
    .trim()
    .replace(/\s+/g, '.');
}

export function getSpanishTimestamp(): string {
  const date = new Date();
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // '0' is '12'
  
  return `${day} de ${month} de ${year} a las ${hours}:${minutes}:${seconds} ${ampm} UTC-5`;
}

const VARONES_NAMES = [
  "Daniel Gustavo Castillo Ramirez",
  "Dayner Floymer Ocana Marchino",
  "Jerardo Blaz Chuquino Campos",
  "Jesus Ensoriano Ponte Acuna",
  "Jhan Carlos Espinoza Veramendi",
  "Joel Jharlyn Dominguez Tolentino",
  "Jorge Luis Neyra Abad",
  "Jose Enrrique Gomero Soto",
  "Roberto Germias Chuquino Campos"
];

const MUJERES_NAMES = [
  "Alicia Aurelia Berrospi Rodriguez",
  "Anyela Rosali Vasquez Vela",
  "Aracely Yesenia Acuna Davila",
  "Dalmira Dominguez Saenz",
  "Ericka Nataly Sifuentes Fernandez",
  "Fiorella Lizeth Medrano Rios",
  "Flormelinda Hilario Carlos",
  "Jasmin Rocio Ramos Villanueva",
  "Maria Edith del Carmen Contreras Lucio",
  "Mavila Johana Ticlla Casique",
  "Melissa Gloria Diego Ramirez",
  "Micaela Esther Meza Rojas",
  "Nayli Yaquelin Rodriguez Mendoza",
  "Saet Sanchez Huayanay",
  "Suileth Nayeli Roberto Alva",
  "Yorbelitt Jimena Espinoza Felix"
];

export const DEFAULT_SEED_STUDENTS: SeedStudent[] = [
  ...VARONES_NAMES.map(name => ({
    id: normalizeNameId(name),
    nombre: name,
    género: 'hombres' as const,
    elo: 1200,
    votos_ganados: 0,
    votos_perdidos: 0,
    perfilPhotoUrl: getAvatarUrl(name, 'men')
  })),
  ...MUJERES_NAMES.map(name => ({
    id: normalizeNameId(name),
    nombre: name,
    género: 'mujeres' as const,
    elo: 1200,
    votos_ganados: 0,
    votos_perdidos: 0,
    perfilPhotoUrl: getAvatarUrl(name, 'women')
  }))
];
