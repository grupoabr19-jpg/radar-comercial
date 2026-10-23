import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { normalizeHeader, parseWorkbook } from '../server/importer.js';

test('normaliza cabeçalhos em português', () => {
  assert.equal(normalizeHeader('  Razão Social  '), 'razao social');
  assert.equal(normalizeHeader('CPF/CNPJ'), 'cpf cnpj');
});

test('detecta cabeçalho e usa a última aba por padrão', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Resumo').addRow(['indicador', 'valor']);
  const sheet = workbook.addWorksheet('Rotas');
  sheet.addRow(['Relatório comercial']);
  sheet.addRow([]);
  sheet.addRow(['Código Cliente', 'Razão Social', 'CNPJ', 'Cidade', 'UF']);
  sheet.addRow([123, 'Metal Teste Ltda', '12.345.678/0001-90', 'Campinas', 'sp']);
  const buffer = await workbook.xlsx.writeBuffer();
  const parsed = await parseWorkbook(buffer);
  assert.equal(parsed.sheetName, 'Rotas');
  assert.equal(parsed.headerRow, 3);
  assert.deepEqual(parsed.detectedFields, ['customerCode', 'companyName', 'cnpj', 'city', 'state']);
  assert.deepEqual(parsed.rows[0].normalized, {
    customerCode: '123', companyName: 'Metal Teste Ltda', cnpj: '12345678000190', city: 'Campinas', state: 'SP',
  });
});

test('reconhece cabeçalhos da base atual do ERP', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Clientes Inativos');
  sheet.addRow(['Cód. Cliente', 'Nome do Cliente', 'Data Criação PN', 'Cidade', 'Estado', 'E-mail', 'Menor dias última venda', 'Faixa última compra', 'Tipo de Vendedor']);
  sheet.addRow(['C020106', 'Cliente Exemplo', new Date('2022-05-10T00:00:00Z'), 'Rio de Janeiro', 'RJ', 'empresa@example.com', 180, 'Acima de 90 dias', 'Interno']);
  const parsed = await parseWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.rows[0].normalized.companyName, 'Cliente Exemplo');
  assert.equal(parsed.rows[0].normalized.customerCreatedAt, '2022-05-10');
  assert.equal(parsed.rows[0].normalized.daysSinceLastSale, 180);
  assert.equal(parsed.rows[0].normalized.sellerType, 'Interno');
});

test('reconhece a aba Base de clientes e extrai cidade e UF do endereço', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Base de clientes');
  sheet.addRow(['Código do cliente', 'CNPJ', 'CEP', 'Endereço']);
  sheet.addRow(['C020098', '16.880.152/0001-66', '37834-686', 'ANGELA CRISTINA BENEDETTI, 203 - POLO DA MODA - Guaxupé/MG']);
  const parsed = await parseWorkbook(await workbook.xlsx.writeBuffer(), 'Base de clientes');
  assert.deepEqual(parsed.detectedFields, ['customerCode', 'cnpj', 'postalCode', 'address']);
  assert.deepEqual(parsed.rows[0].normalized, {
    customerCode: 'C020098',
    cnpj: '16880152000166',
    postalCode: '37834-686',
    address: 'ANGELA CRISTINA BENEDETTI, 203 - POLO DA MODA - Guaxupé/MG',
    city: 'Guaxupé',
    state: 'MG',
    companyName: 'Cliente C020098',
  });
});

test('reconhece região, cidade-polo e coordenadas da planilha de rotas', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Mapa de rotas');
  sheet.addRow(['Rota', 'Cidade Polo', 'Cidade', 'UF', 'Latitude', 'Longitude', 'Distância do Polo km']);
  sheet.addRow(['Eixo Norte', 'Campinas', 'Campinas', 'SP', -22.9056, -47.0608, 0]);
  sheet.addRow(['Eixo Norte', 'Campinas', 'Sumaré', 'SP', -22.8219, -47.2668, 24]);
  const parsed = await parseWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.rows[0].normalized.routeName, 'Eixo Norte');
  assert.equal(parsed.rows[0].normalized.hubCity, 'Campinas');
  assert.equal(parsed.rows[1].normalized.distanceFromHubKm, 24);
});

