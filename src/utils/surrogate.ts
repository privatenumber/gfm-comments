/** Whether the code unit is in the UTF-16 surrogate range. */
export const isSurrogate = (code: number) => code >= 0xD8_00 && code <= 0xDF_FF;

export const isHighSurrogate = (code: number) => code >= 0xD8_00 && code <= 0xDB_FF;

export const isLowSurrogate = (code: number) => code >= 0xDC_00 && code <= 0xDF_FF;
