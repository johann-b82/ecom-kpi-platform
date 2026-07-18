export interface Margin { absolute: number; pct: number }

/** Handelsspanne: absolute margin VK−EK and its share of VK (0 when VK is 0). */
export function margin(ek: number, vk: number): Margin {
  const absolute = vk - ek;
  const pct = vk === 0 ? 0 : (absolute / vk) * 100;
  return { absolute, pct };
}
