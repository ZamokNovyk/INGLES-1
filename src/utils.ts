export function getAvatarUrl(name: string, genre: 'women' | 'men'): string {
  const sanitizedSeed = encodeURIComponent(name.trim());
  
  if (genre === 'women') {
    // Estilo Lorelei o Adventurer optimizado 100% para evitar distorsiones y asegurar facciones femeninas
    // - hair: Cabellos largos o recogidos típicamente femeninos (long01 a long05, o peinados específicos)
    // - features: Sin barba u otros elementos no deseados
    const femaleHair = 'long01,long02,long03,long04,long05,long10';
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${sanitizedSeed}&hair=${femaleHair}&featuresProbability=0`;
  } else {
    // Estilo optimizado de cabello corto típicamente masculino sin distorsiones
    const maleHair = 'short01,short02,short03,short04,short05,short06,short07,short08,short09,short10';
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${sanitizedSeed}&hair=${maleHair}`;
  }
}
