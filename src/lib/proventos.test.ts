import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { parseProventosXlsx } from './proventos'

/** Monta um xlsx mínimo no formato do extrato de proventos da B3. */
function buildXlsx(params: {
  sharedStrings: Array<string>
  rows: Array<string>
}): Uint8Array {
  const sst = `<?xml version="1.0"?><sst>${params.sharedStrings
    .map((s) => `<si><t>${s}</t></si>`)
    .join('')}</sst>`
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>${params.rows.join('')}</sheetData></worksheet>`
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook/>'),
    'xl/sharedStrings.xml': strToU8(sst),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  })
}

const HEADER =
  '<row r="1">' +
  '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>' +
  '<c r="C1" t="s"><v>2</v></c><c r="G1" t="s"><v>3</v></c>' +
  '</row>'

describe('parseProventosXlsx', () => {
  it('parseia linhas do formato B3, ignorando rodapé Total e vazias', () => {
    const xlsx = buildXlsx({
      sharedStrings: [
        'Produto',
        'Pagamento',
        'Tipo de Evento',
        'Valor líquido',
        'XPML11 - XP MALLS FDO INV IMOB FII',
        '23/10/2026',
        'Rendimento',
        'ITSA4 - ITAUSA S/A',
        '01/10/2026',
        'Juros Sobre Capital Próprio',
        'Total',
      ],
      rows: [
        HEADER,
        '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="G2"><v>1.84</v></c></row>',
        '<row r="3"><c r="A3" t="s"><v>7</v></c><c r="B3" t="s"><v>8</v></c><c r="C3" t="s"><v>9</v></c><c r="G3"><v>0.62</v></c></row>',
        '<row r="4"><c r="A4"/><c r="G4"/></row>',
        '<row r="5"><c r="G5" t="s"><v>10</v></c></row>',
        '<row r="6"><c r="G6"><v>2.46</v></c></row>',
      ],
    })
    expect(parseProventosXlsx(xlsx)).toEqual([
      {
        asset: 'XPML11',
        date: '2026-10-23',
        amountCents: 184,
        event: 'Rendimento',
      },
      {
        asset: 'ITSA4',
        date: '2026-10-01',
        amountCents: 62,
        event: 'Juros Sobre Capital Próprio',
      },
    ])
  })

  it('aceita data como serial do Excel e arredonda centavos', () => {
    const xlsx = buildXlsx({
      sharedStrings: ['Produto', 'Pagamento', 'Tipo de Evento', 'Valor líquido', 'MXRF11 - MAXI RENDA'],
      rows: [
        HEADER,
        // 46366 = 2026-12-10 no sistema 1900 do Excel
        '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>46366</v></c><c r="G2"><v>10.005</v></c></row>',
      ],
    })
    const [row] = parseProventosXlsx(xlsx)
    expect(row.asset).toBe('MXRF11')
    expect(row.date).toBe('2026-12-10')
    expect(row.amountCents).toBe(1001)
    expect(row.event).toBeNull()
  })

  it('rejeita arquivo que não é xlsx e planilha sem as colunas esperadas', () => {
    expect(() => parseProventosXlsx(strToU8('não sou zip'))).toThrow(/inválido/)
    const semHeader = buildXlsx({
      sharedStrings: ['Outra', 'Coisa'],
      rows: ['<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'],
    })
    expect(() => parseProventosXlsx(semHeader)).toThrow(/colunas/)
  })
})
