// Validaciones de los avisos recibidos. Devuelven una lista de errores (vacía si todo es válido).

const esEnteroPositivo = v => Number.isInteger(v) && v > 0;
const esEnteroNoNegativo = v => Number.isInteger(v) && v >= 0;
const esTextoNoVacio = v => typeof v === 'string' && v.trim().length > 0;

function validarPedido(body) {
  const errores = [];
  const { pedido_id, comprador, producto_id, cantidad, estado } = body || {};
  if (!esEnteroPositivo(pedido_id)) errores.push('pedido_id debe ser un entero positivo');
  if (!esTextoNoVacio(comprador)) errores.push('comprador no puede estar vacío');
  if (!esEnteroPositivo(producto_id)) errores.push('producto_id debe ser un entero positivo');
  if (!esEnteroPositivo(cantidad)) errores.push('cantidad debe ser un entero mayor que cero');
  if (!esTextoNoVacio(estado)) errores.push('estado debe ser un texto válido');
  return errores;
}

// Contrato definido por Inventario: { itemId, nombre, stock, stockMinimo }
function validarStockBajo(body) {
  const errores = [];
  const { itemId, nombre, stock, stockMinimo } = body || {};
  if (!esEnteroPositivo(itemId)) errores.push('itemId debe ser un entero positivo');
  if (!esTextoNoVacio(nombre)) errores.push('nombre no puede estar vacío');
  if (!esEnteroNoNegativo(stock)) errores.push('stock debe ser un entero mayor o igual a cero');
  if (!esEnteroNoNegativo(stockMinimo)) errores.push('stockMinimo debe ser un entero mayor o igual a cero');
  return errores;
}

module.exports = { validarPedido, validarStockBajo };
