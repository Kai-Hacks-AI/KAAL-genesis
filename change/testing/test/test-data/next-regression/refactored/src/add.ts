const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

export const add = (a: number, b: number): number => sum([a, b]);
