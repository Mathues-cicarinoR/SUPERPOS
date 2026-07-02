// Pix EMV BR Code Generator Utility

function calculateCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    crc ^= (charCode << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  let hex = crc.toString(16).toUpperCase();
  while (hex.length < 4) hex = '0' + hex;
  return hex;
}

export function generatePixPayload(key: string, name: string, city: string, amount: number, txid: string = '***'): string {
  const formatField = (id: string, value: string): string => {
    const len = value.length.toString().padStart(2, '0');
    return id + len + value;
  };

  const merchantAccountInfo =
    formatField('00', 'br.gov.bcb.pix') +
    formatField('01', key.trim());

  let payload =
    formatField('00', '01') + // Payload Format Indicator
    formatField('26', merchantAccountInfo) + // Merchant Account Info
    formatField('52', '040000') + // Merchant Category Code
    formatField('53', '986') + // Currency Code (BRL)
    formatField('54', amount.toFixed(2)) + // Amount
    formatField('58', 'BR') + // Country Code
    formatField('59', name.substring(0, 25).trim()) + // Merchant Name
    formatField('60', city.substring(0, 15).trim()); // Merchant City

  const additionalData = formatField('05', txid.substring(0, 25).trim());
  payload += formatField('62', additionalData);

  payload += '6304';
  payload += calculateCRC16(payload);

  return payload;
}
