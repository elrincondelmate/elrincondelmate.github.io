import {
  browserSessionPersistence,
  onAuthStateChanged,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { adminEmail, auth, db, isFirebaseConfigured, previousDb } from "./firebase.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const defaultSettings = { pesosPorPunto: 100, puntosReferido: 5, whatsapp: "", instagram: "@elrincondelmatesm", ubicacion: "San Martín, Mendoza", venceCupones: false, diasVencimiento: 30 };
const defaultRewards = [
  { id: "10-porciento-yerba-500", nombre: "10% de descuento en yerba", puntos: 500, categoria: "yerba", descripcion: "Solo yerba", activo: true },
  { id: "10-porciento-otros-750", nombre: "10% de descuento en otros productos", puntos: 750, categoria: "otros", descripcion: "Otros productos", activo: true },
];

const tabs = $$('[data-view]');
const customerView = $("#customer-view");
const adminView = $("#admin-view");
const customerForm = $("#customer-form");
const customerPhone = $("#customer-phone");
const customerStatus = $("#customer-status");
const customerAccount = $("#customer-account");
const adminForm = $("#admin-form");
const authStatus = $("#auth-status");
const adminPanel = $("#admin-panel");
const verificationStep = $("#verification-step");
const clientsList = $("#clients-list");
const importButton = $("#import-previous-clients");
const importStatus = $("#import-status");
const clientForm = $("#client-form");
const productForm = $("#product-form");
const purchaseForm = $("#purchase-form");
const purchaseLines = $("#purchase-lines");
const purchaseStatus = $("#purchase-status");
const redemptionForm = $("#coupon-form");
const adminSubmit = adminForm.querySelector("button[type='submit']");

let clientsById = new Map();
let productsById = new Map();
let rewardsById = new Map();
let settings = { ...defaultSettings };
let historyItems = [];
let couponItems = [];
let qrCodeModule;

function setMessage(selector, message) {
  const element = typeof selector === "string" ? $(selector) : selector;
  if (element) element.textContent = message;
}

function showView(viewName) {
  const isAdminView = viewName === "admin";
  customerView.hidden = isAdminView;
  adminView.hidden = !isAdminView;
  customerView.classList.toggle("is-hidden", isAdminView);
  adminView.classList.toggle("is-hidden", !isAdminView);
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewName));
}

function showAdminPage(page) {
  $$('[data-admin-section]').forEach((section) => {
    const active = section.dataset.adminSection === page;
    section.hidden = !active;
    section.classList.toggle("is-hidden", !active);
  });
  $$(".admin-nav-button").forEach((button) => {
    const active = button.dataset.adminPage === page;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#admin-navigation").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function goToPage(page) {
  showAdminPage(page);
  if (page === "history") renderHistory();
  if (page === "coupons") renderCoupons();
}

function clientName(data = {}) {
  return [data.nombre, data.apellido].filter(Boolean).join(" ").trim() || "Cliente";
}

function normalizeArgentinePhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return digits.slice(1);
  if (/^54\d{10}$/.test(digits)) return digits.slice(2);
  if (/^549\d{10}$/.test(digits)) return digits.slice(3);
  return null;
}

function timestampDate(value) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return null;
}

function formatDate(value) {
  const date = timestampDate(value);
  return date ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date) : "Fecha pendiente";
}

function movementLabel(item) {
  const labels = {
    compra: "Compra registrada",
    canje: "Canje confirmado",
    cupon_emitido: "Cupón emitido",
    cupon_usado: "Cupón utilizado",
    cupon_anulado: "Cupón anulado y puntos reintegrados",
    referido: "Puntos por referido",
    ajuste_puntos: "Ajuste de puntos",
    cliente_creado: "Cliente agregado",
    importacion_clientes: "Importación de clientes",
    producto_creado: "Producto creado",
    producto_editado: "Producto actualizado",
    producto_pausado: "Producto pausado",
    producto_reactivado: "Producto reactivado",
    producto_archivado: "Producto quitado del catálogo",
    recompensa_creada: "Recompensa creada",
    recompensa_editada: "Recompensa actualizada",
    recompensa_pausada: "Recompensa pausada",
    recompensa_reactivada: "Recompensa reactivada",
    recompensa_archivada: "Recompensa quitada",
    configuracion_actualizada: "Configuración actualizada",
  };
  return item.descripcion || labels[item.tipo] || item.tipo || "Actividad";
}

function movementPoints(item) {
  const value = Number(item.puntos);
  if (!Number.isFinite(value) || value === 0) return "";
  return `${value > 0 ? "+" : ""}${value} puntos`;
}

function addMovementRow(container, item, clientLookup = true) {
  const row = document.createElement("article");
  row.className = "activity-row";
  const details = document.createElement("div");
  details.className = "activity-main";
  const title = document.createElement("strong");
  title.textContent = movementLabel(item);
  const meta = document.createElement("span");
  const client = clientLookup && item.clienteId ? clientsById.get(item.clienteId) : null;
  const dateText = formatDate(item.creadoEn || item.confirmadoEn);
  const clientText = client ? clientName(client) : (item.clienteId ? `Cliente ${item.clienteId}` : "");
  const extra = [clientText, item.detalle, dateText].filter(Boolean).join(" · ");
  meta.textContent = extra;
  details.append(title, meta);
  row.append(details);
  const amount = movementPoints(item);
  if (amount) {
    const points = document.createElement("strong");
    points.className = `movement-points ${Number(item.puntos) < 0 ? "is-negative" : ""}`;
    points.textContent = amount;
    row.append(points);
  }
  container.append(row);
}

async function audit(transaction, { tipo, descripcion, entidad, entidadId, clienteId, puntos, detalle, extras = {} }) {
  const ref = doc(collection(db, "movimientos"));
  transaction.set(ref, {
    tipo,
    descripcion,
    ...(entidad ? { entidad } : {}),
    ...(entidadId ? { entidadId } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(Number.isFinite(puntos) ? { puntos } : {}),
    ...(detalle ? { detalle } : {}),
    ...extras,
    creadoEn: serverTimestamp(),
    creadoPor: auth.currentUser.uid,
    creadoPorCorreo: auth.currentUser.email || adminEmail,
  });
}

function updatePublicClientRewards(points) {
  const rewardsList = $("#customer-rewards");
  rewardsList.replaceChildren();
  const active = [...rewardsById.values()].filter((reward) => reward.activo !== false && reward.archivado !== true);
  active.sort((a, b) => Number(a.puntos) - Number(b.puntos));
  active.forEach((reward) => {
    const item = document.createElement("div");
    item.className = "reward-item";
    const name = document.createElement("span");
    name.textContent = reward.nombre;
    const progress = document.createElement("span");
    const needed = Number(reward.puntos) || 0;
    progress.textContent = points >= needed ? "Disponible en el local" : `Faltan ${needed - points} puntos`;
    item.append(name, progress);
    rewardsList.append(item);
  });
  if (!active.length) rewardsList.textContent = "Pronto habrá nuevas recompensas.";
}

function showCustomerAccount(points) {
  customerForm.hidden = true;
  customerAccount.hidden = false;
  customerAccount.classList.remove("is-hidden");
  $("#customer-greeting").textContent = "Tus puntos";
  $("#customer-points").textContent = String(points);
  updatePublicClientRewards(points);
}

function hideCustomerAccount() {
  customerForm.hidden = false;
  customerAccount.hidden = true;
  customerAccount.classList.add("is-hidden");
}

function updateSelectOptions(select, options, placeholder, render) {
  if (!select) return;
  const selected = select.value;
  select.replaceChildren(new Option(placeholder, ""));
  options.forEach(([id, value]) => select.add(new Option(render(id, value), id)));
  if (options.some(([id]) => id === selected)) select.value = selected;
}

function updateClientChoices() {
  const entries = [...clientsById.entries()].filter(([, client]) => client.activo !== false).sort((a, b) => clientName(a[1]).localeCompare(clientName(b[1]), "es"));
  [$("#purchase-client"), $("#coupon-client"), $("#adjust-client")].forEach((select) => updateSelectOptions(select, entries, "Elegí un cliente…", (id, data) => `${clientName(data)} · ${id}`));
  updateSelectOptions($("#new-client-referrer"), entries, "Sin referido", (id, data) => `${clientName(data)} · ${id}`);
}

function updateRewardChoices() {
  const entries = [...rewardsById.entries()].filter(([, reward]) => reward.activo !== false && reward.archivado !== true)
    .sort((a, b) => Number(a[1].puntos) - Number(b[1].puntos));
  updateSelectOptions($("#coupon-reward"), entries, "Elegí una recompensa…", (id, reward) => `${reward.nombre} · ${reward.puntos} puntos`);
}

function updatePurchaseProductChoices(select) {
  const entries = [...productsById.entries()].filter(([, product]) => product.activo !== false && product.archivado !== true)
    .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"));
  updateSelectOptions(select, entries, "Elegí un producto…", (id, product) => `${product.nombre} · ${currency.format(product.precio)}`);
}

function updatePurchaseSummary() {
  let total = 0;
  $$(".purchase-line", purchaseLines).forEach((line) => {
    const product = productsById.get($("select", line).value);
    const quantity = Number($("input", line).value);
    const subtotal = product && Number.isSafeInteger(quantity) && quantity > 0 ? product.precio * quantity : 0;
    $(".line-subtotal", line).textContent = currency.format(subtotal);
    total += subtotal;
  });
  $("#purchase-total").textContent = currency.format(total);
  $("#purchase-points").textContent = String(Math.floor(total / (Number(settings.pesosPorPunto) || 100)));
  $("#points-rule-help").textContent = `Se suma 1 punto cada ${currency.format(Number(settings.pesosPorPunto) || 100)} de compra.`;
}

function addPurchaseLine() {
  const line = document.createElement("div");
  line.className = "purchase-line";
  const product = document.createElement("select");
  product.setAttribute("aria-label", "Producto");
  updatePurchaseProductChoices(product);
  const quantity = document.createElement("input");
  quantity.type = "number";
  quantity.min = "1";
  quantity.step = "1";
  quantity.value = "1";
  quantity.inputMode = "numeric";
  quantity.setAttribute("aria-label", "Cantidad");
  const subtotal = document.createElement("strong");
  subtotal.className = "line-subtotal";
  subtotal.textContent = currency.format(0);
  const remove = document.createElement("button");
  remove.className = "text-button remove-line";
  remove.type = "button";
  remove.textContent = "Quitar";
  remove.setAttribute("aria-label", "Quitar producto de la compra");
  remove.addEventListener("click", () => { line.remove(); updatePurchaseSummary(); });
  product.addEventListener("change", updatePurchaseSummary);
  quantity.addEventListener("input", updatePurchaseSummary);
  line.append(product, quantity, subtotal, remove);
  purchaseLines.append(line);
  updatePurchaseSummary();
}

function updateDashboard() {
  $("#stat-clients").textContent = String(clientsById.size);
  $("#stat-products").textContent = String([...productsById.values()].filter((product) => product.activo !== false && product.archivado !== true).length);
  const now = new Date();
  const sales = historyItems.filter((item) => item.tipo === "compra")
    .filter((item) => {
      const date = timestampDate(item.creadoEn);
      return date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }).reduce((sum, item) => sum + (Number(item.importe) || 0), 0);
  $("#stat-sales").textContent = currency.format(sales);
  const points = [...clientsById.values()].reduce((sum, client) => sum + (Number(client.puntos) || 0), 0);
  $("#stat-points").textContent = String(points);
  const recent = $("#dashboard-history");
  recent.replaceChildren();
  historyItems.slice(0, 5).forEach((item) => addMovementRow(recent, item));
  if (!historyItems.length) recent.textContent = "Todavía no hay actividad registrada.";
}

function clientMatches(client, id, query) {
  return !query || `${clientName(client)} ${id}`.toLocaleLowerCase("es").includes(query);
}

function renderClients() {
  clientsList.replaceChildren();
  const query = String($("#client-search").value || "").trim().toLocaleLowerCase("es");
  const entries = [...clientsById.entries()].filter(([id, client]) => clientMatches(client, id, query))
    .sort((a, b) => clientName(a[1]).localeCompare(clientName(b[1]), "es"));
  $("#client-count").textContent = String(clientsById.size);
  if (!entries.length) {
    clientsList.textContent = clientsById.size ? "No hay clientes que coincidan con esa búsqueda." : "No hay clientes todavía. Importá los anteriores o agregá uno nuevo.";
    return;
  }
  entries.forEach(([id, data]) => {
    const row = document.createElement("div");
    row.className = "record-row";
    const info = document.createElement("div");
    info.className = "record-info";
    const name = document.createElement("strong");
    name.textContent = clientName(data);
    const detail = document.createElement("span");
    detail.textContent = `${Number(data.puntos) || 0} puntos · ${id}${data.activo === false ? " · pausado" : ""}`;
    info.append(name, detail);
    row.append(info);
    const actions = document.createElement("div"); actions.className = "record-actions";
    const editButton = document.createElement("button");
    editButton.type = "button"; editButton.className = "text-button"; editButton.textContent = "Editar";
    editButton.addEventListener("click", async () => {
      const firstName = prompt("Nombre:", data.nombre || ""); if (firstName === null) return;
      const surname = prompt("Apellido:", data.apellido || ""); if (surname === null) return;
      if (!firstName.trim() || !surname.trim()) { setMessage("#admin-status", "El nombre y el apellido no pueden quedar vacíos."); return; }
      const ref = doc(db, "clientes", id);
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error("missing-client");
          transaction.update(ref, { nombre: firstName.trim(), apellido: surname.trim(), actualizadoEn: serverTimestamp() });
          await audit(transaction, { tipo: "administracion", descripcion: `Datos de cliente actualizados: ${firstName.trim()} ${surname.trim()}`, entidad: "cliente", entidadId: id, clienteId: id });
        });
        await Promise.all([loadClients(), loadHistory()]);
      } catch { setMessage("#admin-status", "No se pudieron actualizar los datos del cliente."); }
    });
    actions.append(editButton);
    const statusButton = document.createElement("button"); statusButton.type = "button"; statusButton.className = `text-button ${data.activo === false ? "" : "destructive-link"}`; statusButton.textContent = data.activo === false ? "Reactivar" : "Pausar";
    statusButton.addEventListener("click", async () => {
      const active = data.activo === false;
      if (!active && !confirm(`¿Pausar a ${clientName(data)}? No se podrá usar en compras ni cupones; su saldo e historial se conservan.`)) return;
      const ref = doc(db, "clientes", id);
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error("missing-client");
          transaction.update(ref, { activo: active, actualizadoEn: serverTimestamp() });
          await audit(transaction, { tipo: "administracion", descripcion: `${active ? "Cliente reactivado" : "Cliente pausado"}: ${clientName(data)}`, entidad: "cliente", entidadId: id, clienteId: id });
        });
        await Promise.all([loadClients(), loadHistory()]);
      } catch { setMessage("#admin-status", "No se pudo cambiar el estado del cliente."); }
    });
    actions.append(statusButton);
    const historyButton = document.createElement("button");
    historyButton.type = "button"; historyButton.className = "text-button"; historyButton.textContent = "Ver movimientos";
    historyButton.addEventListener("click", () => {
      $("#history-search").value = id;
      goToPage("history");
    });
    actions.append(historyButton);
    row.append(actions);
    clientsList.append(row);
  });
}

async function loadClients() {
  const snapshot = await getDocs(collection(db, "clientes"));
  clientsById = new Map(snapshot.docs.map((client) => [client.id, client.data()]));
  updateClientChoices();
  renderClients();
  updateDashboard();
}

async function logProductUpdate(productId, patch, action, description) {
  const productRef = doc(db, "productos", productId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(productRef);
    if (!snapshot.exists()) throw new Error("missing-product");
    transaction.update(productRef, { ...patch, actualizadoEn: serverTimestamp() });
    await audit(transaction, { tipo: "administracion", descripcion, entidad: "producto", entidadId: productId, detalle: action });
  });
}

function renderProducts() {
  const list = $("#products-list");
  list.replaceChildren();
  const query = String($("#product-search").value || "").trim().toLocaleLowerCase("es");
  const products = [...productsById.entries()].filter(([, product]) => !query || product.nombre.toLocaleLowerCase("es").includes(query))
    .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"));
  $("#product-count").textContent = String(productsById.size);
  if (!products.length) { list.textContent = "No hay productos que mostrar."; return; }
  products.forEach(([id, product]) => {
    const row = document.createElement("article");
    row.className = `record-row ${product.archivado ? "is-archived" : ""}`;
    const info = document.createElement("div");
    info.className = "record-info";
    const name = document.createElement("strong");
    name.textContent = product.nombre;
    const status = product.archivado ? "quitado del catálogo" : product.activo === false ? "pausado" : "activo";
    const detail = document.createElement("span");
    detail.textContent = `${currency.format(Number(product.precio) || 0)} · ${status}`;
    info.append(name, detail);
    const actions = document.createElement("div");
    actions.className = "record-actions";
    const edit = document.createElement("button");
    edit.type = "button"; edit.className = "text-button"; edit.textContent = "Editar";
    edit.addEventListener("click", () => {
      const nameInput = prompt("Nombre del producto:", product.nombre);
      if (nameInput === null) return;
      const priceInput = prompt("Precio en pesos:", String(product.precio));
      if (priceInput === null) return;
      const newName = nameInput.trim(); const newPrice = Number(priceInput);
      if (!newName || !Number.isSafeInteger(newPrice) || newPrice < 1) { setMessage("#admin-status", "Revisá el nombre y el precio entero mayor a 0."); return; }
      logProductUpdate(id, { nombre: newName, precio: newPrice }, "edición", `Producto actualizado: ${newName}`)
        .then(loadProducts).catch(() => setMessage("#admin-status", "No se pudo actualizar el producto."));
    });
    actions.append(edit);
    if (!product.archivado) {
      const toggle = document.createElement("button");
      toggle.type = "button"; toggle.className = "text-button"; toggle.textContent = product.activo === false ? "Reactivar" : "Pausar";
      toggle.addEventListener("click", async () => {
        const active = product.activo === false;
        try {
          await logProductUpdate(id, { activo: active }, active ? "reactivado" : "pausado", active ? `Producto reactivado: ${product.nombre}` : `Producto pausado: ${product.nombre}`);
          await loadProducts();
        } catch { setMessage("#admin-status", "No se pudo cambiar el estado del producto."); }
      });
      actions.append(toggle);
      const archive = document.createElement("button");
      archive.type = "button"; archive.className = "text-button destructive-link"; archive.textContent = "Quitar";
      archive.addEventListener("click", async () => {
        if (!confirm(`¿Quitar “${product.nombre}” del catálogo? Se conserva en las compras y el historial.`)) return;
        try {
          await logProductUpdate(id, { activo: false, archivado: true }, "archivado", `Producto quitado: ${product.nombre}`);
          await loadProducts();
        } catch { setMessage("#admin-status", "No se pudo quitar el producto."); }
      });
      actions.append(archive);
    }
    row.append(info, actions);
    list.append(row);
  });
  $$(".purchase-line select", purchaseLines).forEach(updatePurchaseProductChoices);
  updatePurchaseSummary();
}

async function loadProducts() {
  const snapshot = await getDocs(collection(db, "productos"));
  productsById = new Map(snapshot.docs.map((product) => [product.id, product.data()]));
  renderProducts();
  updateDashboard();
}

async function seedDefaultRewards() {
  const refs = defaultRewards.map((reward) => doc(db, "recompensas", reward.id));
  const publicRefs = defaultRewards.map((reward) => doc(db, "recompensasPublicas", reward.id));
  await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const publicSnapshots = await Promise.all(publicRefs.map((ref) => transaction.get(ref)));
    for (let index = 0; index < defaultRewards.length; index += 1) {
      const { id, ...reward } = defaultRewards[index];
      const rewardData = snapshots[index].exists() ? snapshots[index].data() : reward;
      if (!snapshots[index].exists()) {
        transaction.set(refs[index], { ...reward, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
        await audit(transaction, { tipo: "administracion", descripcion: `Recompensa inicial creada: ${reward.nombre}`, entidad: "recompensa", entidadId: id });
      }
      if (!publicSnapshots[index].exists()) {
        transaction.set(publicRefs[index], { nombre: rewardData.nombre, puntos: rewardData.puntos, categoria: rewardData.categoria || "", descripcion: rewardData.descripcion || "", activo: rewardData.activo !== false && rewardData.archivado !== true });
      }
    }
  });
}

async function loadRewards({ initializeDefaults = false } = {}) {
  let snapshot = await getDocs(collection(db, "recompensas"));
  if (snapshot.empty && initializeDefaults) {
    await seedDefaultRewards();
    snapshot = await getDocs(collection(db, "recompensas"));
  }
  rewardsById = new Map(snapshot.docs.map((reward) => [reward.id, reward.data()]));
  renderRewards();
  updateRewardChoices();
}

function rewardCategoryLabel(category) {
  return ({ yerba: "Solo yerba", otros: "Otros productos", todo: "Todo el catálogo" })[category] || category || "Sin categoría";
}

function renderRewards() {
  const list = $("#rewards-list");
  list.replaceChildren();
  const entries = [...rewardsById.entries()].sort((a, b) => Number(a[1].puntos) - Number(b[1].puntos));
  if (!entries.length) { list.textContent = "Todavía no hay recompensas."; return; }
  entries.forEach(([id, reward]) => {
    const row = document.createElement("article");
    row.className = `record-row ${reward.archivado ? "is-archived" : ""}`;
    const info = document.createElement("div"); info.className = "record-info";
    const name = document.createElement("strong"); name.textContent = reward.nombre;
    const status = reward.archivado ? "quitada" : reward.activo === false ? "pausada" : "activa";
    const detail = document.createElement("span"); detail.textContent = `${reward.puntos} puntos · ${rewardCategoryLabel(reward.categoria)} · ${status}`;
    info.append(name, detail);
    const actions = document.createElement("div"); actions.className = "record-actions";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-button"; edit.textContent = "Editar";
    edit.addEventListener("click", () => {
      const nameInput = prompt("Nombre de la recompensa:", reward.nombre);
      if (nameInput === null) return;
      const pointsInput = prompt("Puntos necesarios:", String(reward.puntos));
      if (pointsInput === null) return;
      const categoryInput = prompt("Productos incluidos (yerba / otros / todo):", reward.categoria || "todo");
      if (categoryInput === null) return;
      const descriptionInput = prompt("Descripción para el cliente:", reward.descripcion || "");
      if (descriptionInput === null) return;
      const newName = nameInput.trim(); const points = Number(pointsInput);
      const category = categoryInput.trim().toLowerCase();
      if (!newName || !Number.isSafeInteger(points) || points < 1 || !["yerba", "otros", "todo"].includes(category)) { setMessage("#reward-status", "Revisá el nombre, los puntos y la categoría (yerba, otros o todo)."); return; }
      saveRewardUpdate(id, { ...reward, nombre: newName, puntos: points, categoria: category, descripcion: descriptionInput.trim() }, `Recompensa actualizada: ${newName}`);
    });
    actions.append(edit);
    if (!reward.archivado) {
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "text-button"; toggle.textContent = reward.activo === false ? "Reactivar" : "Pausar";
      toggle.addEventListener("click", () => saveRewardUpdate(id, { ...reward, activo: reward.activo === false }, `${reward.activo === false ? "Recompensa reactivada" : "Recompensa pausada"}: ${reward.nombre}`));
      const archive = document.createElement("button"); archive.type = "button"; archive.className = "text-button destructive-link"; archive.textContent = "Quitar";
      archive.addEventListener("click", () => {
        if (confirm(`¿Quitar “${reward.nombre}”? Los cupones anteriores conservarán su descripción.`)) saveRewardUpdate(id, { ...reward, activo: false, archivado: true }, `Recompensa quitada: ${reward.nombre}`);
      });
      actions.append(toggle, archive);
    }
    row.append(info, actions); list.append(row);
  });
}

async function saveRewardUpdate(id, next, description) {
  const rewardRef = doc(db, "recompensas", id);
  const publicRef = doc(db, "recompensasPublicas", id);
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(rewardRef);
      if (!snapshot.exists()) throw new Error("missing-reward");
      const publicProjection = { nombre: next.nombre, puntos: Number(next.puntos), categoria: next.categoria, descripcion: next.descripcion || "", activo: next.activo !== false && next.archivado !== true };
      transaction.update(rewardRef, { ...next, actualizadoEn: serverTimestamp() });
      transaction.set(publicRef, publicProjection);
      await audit(transaction, { tipo: "administracion", descripcion, entidad: "recompensa", entidadId: id });
    });
    setMessage("#reward-status", "Recompensa actualizada y guardada en el historial.");
    await loadRewards();
  } catch { setMessage("#reward-status", "No se pudo actualizar la recompensa."); }
}

async function loadSettings() {
  const snapshot = await getDoc(doc(db, "configuracion", "negocio"));
  settings = snapshot.exists() ? { ...defaultSettings, ...snapshot.data() } : { ...defaultSettings };
  $("#settings-pesos-por-punto").value = String(settings.pesosPorPunto);
  $("#settings-referidos").value = String(settings.puntosReferido);
  $("#settings-whatsapp").value = settings.whatsapp || "";
  $("#settings-instagram").value = settings.instagram || "";
  $("#settings-ubicacion").value = settings.ubicacion || "";
  $("#settings-coupon-expiry-enabled").checked = settings.venceCupones === true;
  $("#settings-coupon-expiry-days").value = String(settings.diasVencimiento || 30);
  updatePurchaseSummary();
}

async function loadPublicBusinessInfo() {
  try {
    const snapshot = await getDoc(doc(db, "configuracionPublica", "negocio"));
    const data = snapshot.exists() ? snapshot.data() : defaultSettings;
    const location = $("#business-location");
    const links = $("#business-links");
    const whatsapp = $("#whatsapp-link");
    const instagram = $("#instagram-link");
    location.textContent = data.ubicacion ? `Encontranos en ${data.ubicacion}.` : "";
    const phone = String(data.whatsapp || "").replace(/\D/g, "");
    whatsapp.href = phone ? `https://wa.me/${phone}?text=${encodeURIComponent("Hola, quería consultar sobre el Club de Puntos de El Rincón del Mate.")}` : "#";
    whatsapp.hidden = !phone;
    const handle = String(data.instagram || "").trim().replace(/^@/, "");
    instagram.href = handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : "#";
    instagram.hidden = !handle;
    links.hidden = !phone && !handle;
  } catch {
    $("#business-location").textContent = "";
    $("#business-links").hidden = true;
  }
}

async function loadHistory() {
  const snapshot = await getDocs(collection(db, "movimientos"));
  historyItems = snapshot.docs.map((movement) => ({ id: movement.id, ...movement.data() }))
    .sort((a, b) => (timestampDate(b.creadoEn)?.getTime() || 0) - (timestampDate(a.creadoEn)?.getTime() || 0));
  updateDashboard();
  renderHistory();
}

function renderHistory() {
  const list = $("#history-list");
  if (!list) return;
  list.replaceChildren();
  const type = $("#history-filter").value || "todas";
  const query = String($("#history-search")?.value || "").trim().toLocaleLowerCase("es");
  const visible = historyItems.filter((item) => {
    const typeMatch = type === "todas" || (type === "canje" ? ["canje", "cupon_emitido", "cupon_usado", "cupon_anulado"].includes(item.tipo) : type === "administracion" ? item.tipo === "administracion" : type === "ajuste" ? ["ajuste_puntos", "referido"].includes(item.tipo) : item.tipo === type);
    const text = `${movementLabel(item)} ${item.detalle || ""} ${item.clienteId || ""} ${clientName(clientsById.get(item.clienteId) || {})}`.toLocaleLowerCase("es");
    return typeMatch && (!query || text.includes(query));
  });
  if (!visible.length) list.textContent = "No hay movimientos que coincidan con el filtro.";
  visible.forEach((item) => addMovementRow(list, item));
  setMessage("#history-status", `${visible.length} movimientos`);
}

async function loadCoupons() {
  const snapshot = await getDocs(collection(db, "cupones"));
  couponItems = snapshot.docs.map((coupon) => ({ id: coupon.id, ...coupon.data() }))
    .sort((a, b) => (timestampDate(b.creadoEn)?.getTime() || 0) - (timestampDate(a.creadoEn)?.getTime() || 0));
  renderCoupons();
}

function renderCoupons() {
  const list = $("#coupons-list");
  if (!list) return;
  list.replaceChildren();
  const showAll = $("#show-used-coupons").checked;
  const coupons = couponItems.filter((coupon) => showAll || coupon.estado === "pendiente");
  if (!coupons.length) { list.textContent = "No hay cupones para mostrar."; return; }
  coupons.forEach((coupon) => {
    const row = document.createElement("article"); row.className = "record-row coupon-row";
    const info = document.createElement("div"); info.className = "record-info";
    const code = document.createElement("strong"); code.className = "coupon-code"; code.textContent = coupon.codigo || coupon.id;
    const status = coupon.estado === "pendiente" && coupon.venceEn && timestampDate(coupon.venceEn) < new Date() ? "vencido" : coupon.estado;
    const detail = document.createElement("span"); detail.textContent = `${coupon.clienteNombre || clientName(clientsById.get(coupon.clienteId) || {})} · ${coupon.recompensaNombre} · ${coupon.puntos} puntos · ${status} · ${formatDate(coupon.creadoEn)}`;
    info.append(code, detail);
    const qr = document.createElement("canvas");
    qr.className = "coupon-qr";
    qr.setAttribute("aria-label", `Código QR del cupón ${coupon.codigo || coupon.id}`);
    drawCouponQr(qr, coupon.codigo || coupon.id);
    const actions = document.createElement("div"); actions.className = "record-actions";
    if (coupon.estado === "pendiente") {
      const used = document.createElement("button"); used.type = "button"; used.className = "text-button"; used.textContent = "Marcar usado";
      used.addEventListener("click", () => markCouponUsed(coupon));
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "text-button destructive-link"; cancel.textContent = "Anular y reintegrar";
      cancel.addEventListener("click", () => cancelCoupon(coupon));
      actions.append(used, cancel);
    }
    row.append(info, qr, actions); list.append(row);
  });
}

async function drawCouponQr(canvas, value) {
  try {
    qrCodeModule ||= import("https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm").then((module) => module.default);
    const QRCode = await qrCodeModule;
    await QRCode.toCanvas(canvas, value, { width: 112, margin: 1, errorCorrectionLevel: "M" });
  } catch {
    canvas.hidden = true;
    setMessage("#coupon-status", "No se pudo dibujar el QR; el código escrito sigue sirviendo para identificar el cupón.");
  }
}

function createCouponCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return `MATE-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

async function issueCoupon(event) {
  event.preventDefault();
  const clientId = $("#coupon-client").value;
  const rewardId = $("#coupon-reward").value;
  const client = clientsById.get(clientId);
  const reward = rewardsById.get(rewardId);
  if (!client || !reward) { setMessage("#coupon-status", "Elegí el cliente y la recompensa."); return; }
  if (!confirm(`Emitir “${reward.nombre}” para ${clientName(client)} y descontar ${reward.puntos} puntos ahora?`)) return;
  const phone = normalizeArgentinePhone(clientId);
  if (!phone) { setMessage("#coupon-status", "El celular del cliente necesita revisión antes de emitir el cupón."); return; }
  const code = createCouponCode();
  const clientRef = doc(db, "clientes", clientId);
  const publicRef = doc(db, "consultasPuntos", phone);
  const rewardRef = doc(db, "recompensas", rewardId);
  const couponRef = doc(db, "cupones", code);
  const status = $("#coupon-status"); status.textContent = "Emitiendo cupón…";
  try {
    await runTransaction(db, async (transaction) => {
      const clientSnapshot = await transaction.get(clientRef);
      const rewardSnapshot = await transaction.get(rewardRef);
      const couponSnapshot = await transaction.get(couponRef);
      if (!clientSnapshot.exists() || !rewardSnapshot.exists()) throw new Error("missing-record");
      if (clientSnapshot.data().activo === false) throw new Error("inactive-client");
      if (couponSnapshot.exists()) throw new Error("duplicate-code");
      const currentReward = rewardSnapshot.data();
      if (currentReward.activo === false || currentReward.archivado) throw new Error("inactive-reward");
      const pointsCost = Number(currentReward.puntos);
      const pointsNow = Number(clientSnapshot.data().puntos);
      if (!Number.isSafeInteger(pointsNow) || !Number.isSafeInteger(pointsCost) || pointsNow < pointsCost) throw new Error("insufficient-points");
      const newBalance = pointsNow - pointsCost;
      const expiryDate = settings.venceCupones ? new Date(Date.now() + Math.max(1, Number(settings.diasVencimiento) || 30) * 86400000) : null;
      transaction.update(clientRef, { puntos: newBalance, actualizadoEn: serverTimestamp() });
      transaction.set(publicRef, { puntos: newBalance });
      transaction.set(couponRef, {
        codigo: code, clienteId: clientId, clienteNombre: clientName(client), recompensaId: rewardId,
        recompensaNombre: currentReward.nombre, puntos: pointsCost, categoria: currentReward.categoria || "",
        estado: "pendiente", creadoEn: serverTimestamp(), creadoPor: auth.currentUser.uid,
        ...(expiryDate ? { venceEn: expiryDate } : {}),
      });
      await audit(transaction, { tipo: "cupon_emitido", descripcion: `Cupón ${code} emitido`, entidad: "cupon", entidadId: code, clienteId, puntos: -pointsCost, detalle: currentReward.nombre, extras: { referenciaId: code } });
    });
    status.textContent = `Cupón ${code} emitido. Los puntos ya se descontaron; presentalo en el local para marcarlo como usado.`;
    redemptionForm.reset();
    await Promise.all([loadClients(), loadCoupons(), loadHistory()]);
  } catch (error) {
    status.textContent = ({
      "missing-record": "No encontramos ese cliente o recompensa.",
      "inactive-client": "Ese cliente está pausado y no puede emitir cupones.",
      "duplicate-code": "El código ya existe. Intentá emitirlo de nuevo.",
      "inactive-reward": "Esa recompensa está pausada o fue quitada.",
      "insufficient-points": "El cliente no tiene puntos suficientes para esa recompensa.",
    })[error.message] || "No se pudo emitir el cupón; no se aplicaron cambios.";
  }
}

async function markCouponUsed(coupon) {
  if (coupon.venceEn && timestampDate(coupon.venceEn) < new Date()) { setMessage("#coupon-status", "Este cupón venció. Anulalo para devolver los puntos al cliente."); return; }
  if (!confirm(`¿Marcar el cupón ${coupon.codigo} como usado?`)) return;
  const couponRef = doc(db, "cupones", coupon.id);
  const movementRef = doc(collection(db, "movimientos"));
  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(couponRef);
      if (!snapshot.exists() || snapshot.data().estado !== "pendiente") throw new Error("coupon-not-active");
      transaction.update(couponRef, { estado: "usado", usadoEn: serverTimestamp(), usadoPor: auth.currentUser.uid });
      transaction.set(movementRef, { tipo: "cupon_usado", descripcion: `Cupón ${coupon.codigo} utilizado`, entidad: "cupon", entidadId: coupon.id, clienteId: coupon.clienteId, puntos: 0, creadoEn: serverTimestamp(), creadoPor: auth.currentUser.uid });
    });
    await Promise.all([loadCoupons(), loadHistory()]);
    setMessage("#coupon-status", `Cupón ${coupon.codigo} marcado como usado.`);
  } catch { setMessage("#coupon-status", "No se pudo marcar el cupón; puede que ya haya cambiado de estado."); }
}

async function cancelCoupon(coupon) {
  if (!confirm(`¿Anular el cupón ${coupon.codigo}? Se devolverán ${coupon.puntos} puntos al cliente.`)) return;
  const phone = normalizeArgentinePhone(coupon.clienteId);
  if (!phone) { setMessage("#coupon-status", "El celular del cliente necesita revisión para reintegrar puntos."); return; }
  const couponRef = doc(db, "cupones", coupon.id);
  const clientRef = doc(db, "clientes", coupon.clienteId);
  const publicRef = doc(db, "consultasPuntos", phone);
  try {
    await runTransaction(db, async (transaction) => {
      const couponSnapshot = await transaction.get(couponRef);
      const clientSnapshot = await transaction.get(clientRef);
      if (!couponSnapshot.exists() || !clientSnapshot.exists() || couponSnapshot.data().estado !== "pendiente") throw new Error("coupon-not-active");
      const newBalance = (Number(clientSnapshot.data().puntos) || 0) + Number(coupon.puntos);
      transaction.update(clientRef, { puntos: newBalance, actualizadoEn: serverTimestamp() });
      transaction.set(publicRef, { puntos: newBalance });
      transaction.update(couponRef, { estado: "anulado", anuladoEn: serverTimestamp(), anuladoPor: auth.currentUser.uid });
      await audit(transaction, { tipo: "cupon_anulado", descripcion: `Cupón ${coupon.codigo} anulado y puntos reintegrados`, entidad: "cupon", entidadId: coupon.id, clienteId: coupon.clienteId, puntos: Number(coupon.puntos), detalle: coupon.recompensaNombre });
    });
    await Promise.all([loadClients(), loadCoupons(), loadHistory()]);
    setMessage("#coupon-status", "Cupón anulado y puntos reintegrados.");
  } catch { setMessage("#coupon-status", "No se pudo anular el cupón; verificá si ya fue utilizado."); }
}

async function importPreviousClients() {
  importButton.disabled = true;
  importStatus.textContent = "Buscando clientes en el sistema anterior…";
  try {
    const source = await getDocs(collection(previousDb, "clientes"));
    if (source.empty) { importStatus.textContent = "No encontramos clientes en el proyecto anterior."; return; }
    const entries = []; let invalid = 0;
    source.docs.forEach((client) => {
      const phone = normalizeArgentinePhone(client.id); const data = client.data(); const points = Number(data.puntos);
      if (!phone || !Number.isSafeInteger(points) || points < 0) { invalid += 1; return; }
      entries.push({ phone, data, points });
    });
    if (!entries.length) { importStatus.textContent = `No había clientes importables. Registros para revisar: ${invalid}.`; return; }
    if (!confirm(`Se encontraron ${entries.length} clientes válidos${invalid ? ` y ${invalid} registros para revisar` : ""}. Se copiarán al proyecto nuevo sin borrar los originales y sin sobrescribir clientes existentes. ¿Continuar?`)) {
      importStatus.textContent = "Importación cancelada; no se modificó ningún dato."; return;
    }
    let imported = 0; let skipped = 0;
    for (const entry of entries) {
      const clientRef = doc(db, "clientes", entry.phone); const publicRef = doc(db, "consultasPuntos", entry.phone);
      const wasImported = await runTransaction(db, async (transaction) => {
        const existingClient = await transaction.get(clientRef); const existingPublic = await transaction.get(publicRef);
        if (existingClient.exists() || existingPublic.exists()) return false;
        transaction.set(clientRef, { ...entry.data, puntos: entry.points });
        transaction.set(publicRef, { puntos: entry.points });
        return true;
      });
      if (wasImported) imported += 1; else skipped += 1;
      if ((imported + skipped) % 10 === 0) importStatus.textContent = `Importando… ${imported + skipped} de ${entries.length}`;
    }
    const logRef = doc(collection(db, "movimientos"));
    await setDoc(logRef, { tipo: "importacion_clientes", descripcion: "Importación manual desde el sistema anterior", detalle: `${imported} importados; ${skipped} ya existentes; ${invalid} para revisar`, cantidad: imported, creadoEn: serverTimestamp(), creadoPor: auth.currentUser.uid, creadoPorCorreo: auth.currentUser.email || adminEmail });
    await Promise.all([loadClients(), loadHistory()]);
    importStatus.textContent = `Listo: ${imported} importados, ${skipped} ya existentes${invalid ? `, ${invalid} para revisar` : ""}. Los datos anteriores siguen intactos.`;
  } catch { importStatus.textContent = "No se pudo leer o copiar la base anterior. No se borraron datos; avisame para revisar el acceso."; }
  finally { importButton.disabled = false; }
}

tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
$$(".admin-nav-button").forEach((button) => button.addEventListener("click", () => goToPage(button.dataset.adminPage)));
$$('[data-go-page]').forEach((button) => button.addEventListener("click", () => goToPage(button.dataset.goPage)));

if (isFirebaseConfigured && adminEmail && !adminEmail.startsWith("REPLACE_WITH_")) {
  loadPublicBusinessInfo();
  $("#lookup-button").disabled = false;
  adminSubmit.disabled = false;
  setMessage(customerStatus, "Ingresá los 10 números de tu celular.");
  setMessage(authStatus, "Conectado. Ingresá con la cuenta administradora autorizada.");

  customerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = customerPhone.value.replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone)) { setMessage(customerStatus, "Ingresá los 10 números del celular, sin 0 ni 15."); return; }
    const button = $("#lookup-button"); button.disabled = true; setMessage(customerStatus, "Buscando tus puntos…");
    try {
      const [snapshot, rewardsSnapshot] = await Promise.all([
        getDoc(doc(db, "consultasPuntos", phone)),
        getDocs(collection(db, "recompensasPublicas")),
      ]);
      if (!snapshot.exists()) { setMessage(customerStatus, "No encontramos puntos asociados a ese celular. Consultá en el local."); return; }
      rewardsById = new Map(rewardsSnapshot.docs.filter((reward) => reward.data().activo !== false).map((reward) => [reward.id, reward.data()]));
      if (!rewardsById.size) defaultRewards.forEach(({ id, ...reward }) => rewardsById.set(id, reward));
      showCustomerAccount(Number(snapshot.data().puntos) || 0);
      setMessage(customerStatus, "Para usar una recompensa, acercate al local.");
    } catch { setMessage(customerStatus, "No pudimos consultar ahora. Intentá de nuevo más tarde."); }
    finally { button.disabled = false; }
  });
  $("#customer-signout").addEventListener("click", () => { hideCustomerAccount(); customerPhone.value = ""; setMessage(customerStatus, "Consulta cerrada."); });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      adminPanel.hidden = true; adminPanel.classList.add("is-hidden");
      $("#admin-login-card").hidden = false; verificationStep.hidden = true; verificationStep.classList.add("is-hidden");
      return;
    }
    $("#admin-login-card").hidden = true;
    if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      await signOut(auth); $("#admin-login-card").hidden = false; authStatus.textContent = "Esta cuenta no es el correo administrador autorizado."; return;
    }
    if (!user.emailVerified) {
      adminPanel.hidden = true; adminPanel.classList.add("is-hidden");
      $("#admin-login-card").hidden = false; verificationStep.hidden = false; verificationStep.classList.remove("is-hidden");
      authStatus.textContent = "La cuenta es correcta, pero falta verificar el correo."; return;
    }
    verificationStep.hidden = true; verificationStep.classList.add("is-hidden");
    adminPanel.hidden = false; adminPanel.classList.remove("is-hidden");
    $("#admin-welcome").textContent = `Sesión: ${user.email}`;
    setMessage(authStatus, `Sesión iniciada: ${user.email}`);
    try {
      await Promise.all([loadClients(), loadProducts(), loadRewards({ initializeDefaults: true }), loadSettings(), loadHistory(), loadCoupons()]);
      showAdminPage("dashboard");
      setMessage("#admin-status", "Información cargada. Los cambios administrativos quedan anotados en el historial.");
    } catch { setMessage("#admin-status", "No se pudo cargar la información. Revisá las reglas de Firestore."); }
  });

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const data = new FormData(adminForm); adminSubmit.disabled = true; setMessage(authStatus, "Verificando acceso…");
    try { await setPersistence(auth, browserSessionPersistence); await signInWithEmailAndPassword(auth, data.get("email"), data.get("password")); }
    catch { setMessage(authStatus, "No se pudo iniciar sesión. Revisá el correo y la contraseña."); }
    finally { adminForm.reset(); adminSubmit.disabled = false; }
  });
  $("#admin-signout").addEventListener("click", () => signOut(auth));
  $("#send-verification-button").addEventListener("click", async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { await sendEmailVerification(auth.currentUser); setMessage(authStatus, "Enviamos un enlace de verificación. Revisá tu correo y también Spam."); }
    catch { setMessage(authStatus, "No se pudo enviar el correo. Esperá un momento e intentá nuevamente."); }
    finally { button.disabled = false; }
  });
  $("#check-verification-button").addEventListener("click", async () => {
    const user = auth.currentUser; if (!user) return;
    try { await user.reload(); await user.getIdToken(true); if (user.emailVerified) location.reload(); else setMessage(authStatus, "Todavía no figura verificado. Abrí el enlace del correo y volvé a intentar."); }
    catch { setMessage(authStatus, "No pudimos comprobar la verificación. Recargá la página e ingresá otra vez."); }
  });
  $("#pending-signout-button").addEventListener("click", () => signOut(auth));

  importButton.addEventListener("click", importPreviousClients);
  $("#client-search").addEventListener("input", renderClients);
  clientForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const data = new FormData(clientForm);
    const name = String(data.get("nombre") || "").trim(); const surname = String(data.get("apellido") || "").trim(); const phone = normalizeArgentinePhone(data.get("phone"));
    if (!name || !surname || !phone) { setMessage("#admin-status", "Ingresá nombre, apellido y los 10 dígitos del celular."); return; }
    const referrerId = $("#new-client-referrer").value;
    const clientRef = doc(db, "clientes", phone); const publicRef = doc(db, "consultasPuntos", phone);
    const referrerRef = referrerId ? doc(db, "clientes", referrerId) : null;
    const referrerPublicRef = referrerId ? doc(db, "consultasPuntos", referrerId) : null;
    try {
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(clientRef); const publicDoc = await transaction.get(publicRef);
        if (existing.exists() || publicDoc.exists()) throw new Error("duplicate-client");
        const referrerSnapshot = referrerRef ? await transaction.get(referrerRef) : null;
        if (referrerRef && (!referrerSnapshot?.exists() || referrerId === phone)) throw new Error("invalid-referrer");
        transaction.set(clientRef, { nombre: name, apellido: surname, puntos: 0, activo: true, ...(referrerId ? { referidoPor: referrerId } : {}), creadoEn: serverTimestamp() });
        transaction.set(publicRef, { puntos: 0 });
        await audit(transaction, { tipo: "administracion", descripcion: `Cliente agregado: ${name} ${surname}`, entidad: "cliente", entidadId: phone, clienteId: phone });
        const referralPoints = Number(settings.puntosReferido) || 0;
        if (referrerRef && referralPoints > 0) {
          const referrerBalance = Number(referrerSnapshot.data().puntos) || 0;
          transaction.update(referrerRef, { puntos: referrerBalance + referralPoints, actualizadoEn: serverTimestamp() });
          transaction.set(referrerPublicRef, { puntos: referrerBalance + referralPoints });
          await audit(transaction, { tipo: "referido", descripcion: "Puntos por recomendar un nuevo cliente", entidad: "cliente", entidadId: referrerId, clienteId: referrerId, puntos: referralPoints, detalle: `Nuevo cliente: ${name} ${surname}` });
        }
      });
      clientForm.reset(); setMessage("#admin-status", "Cliente agregado y anotado en el historial."); await Promise.all([loadClients(), loadHistory()]);
    } catch (error) { setMessage("#admin-status", error.message === "duplicate-client" ? "Ya existe un cliente con ese celular." : error.message === "invalid-referrer" ? "El cliente que recomendó debe existir y ser otra persona." : "No se pudo agregar el cliente. Revisá las reglas de Firestore."); }
  });

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault(); const data = new FormData(productForm);
    const nombre = String(data.get("nombre") || "").trim(); const precio = Number(data.get("precio"));
    if (!nombre || !Number.isSafeInteger(precio) || precio < 1) { setMessage("#admin-status", "Ingresá el nombre y un precio entero mayor a 0."); return; }
    const ref = doc(collection(db, "productos"));
    try {
      await runTransaction(db, async (transaction) => {
        transaction.set(ref, { nombre, precio, activo: true, archivado: false, creadoEn: serverTimestamp() });
        await audit(transaction, { tipo: "administracion", descripcion: `Producto creado: ${nombre}`, entidad: "producto", entidadId: ref.id, detalle: currency.format(precio) });
      });
      productForm.reset(); setMessage("#admin-status", "Producto creado y anotado en el historial."); await Promise.all([loadProducts(), loadHistory()]);
    } catch { setMessage("#admin-status", "No se pudo crear el producto."); }
  });
  $("#product-search").addEventListener("input", renderProducts);

  $("#reward-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const name = $("#reward-name").value.trim(); const points = Number($("#reward-points").value);
    const category = $("#reward-category").value; const description = $("#reward-description").value.trim();
    if (!name || !Number.isSafeInteger(points) || points < 1) { setMessage("#reward-status", "Ingresá un nombre y puntos necesarios mayores a 0."); return; }
    const ref = doc(collection(db, "recompensas")); const publicRef = doc(db, "recompensasPublicas", ref.id);
    try {
      await runTransaction(db, async (transaction) => {
        transaction.set(ref, { nombre: name, puntos: points, categoria: category, descripcion: description, activo: true, archivado: false, creadoEn: serverTimestamp() });
        transaction.set(publicRef, { nombre: name, puntos, categoria: category, descripcion: description, activo: true });
        await audit(transaction, { tipo: "administracion", descripcion: `Recompensa creada: ${name}`, entidad: "recompensa", entidadId: ref.id, detalle: `${points} puntos` });
      });
      $("#reward-form").reset(); setMessage("#reward-status", "Recompensa creada y anotada en el historial."); await Promise.all([loadRewards(), loadHistory()]);
    } catch { setMessage("#reward-status", "No se pudo crear la recompensa."); }
  });

  $("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const pesos = Number($("#settings-pesos-por-punto").value); const referidos = Number($("#settings-referidos").value);
    const expiryEnabled = $("#settings-coupon-expiry-enabled").checked; const days = Number($("#settings-coupon-expiry-days").value || defaultSettings.diasVencimiento);
    if (!Number.isSafeInteger(pesos) || pesos < 1 || !Number.isSafeInteger(referidos) || referidos < 0 || (expiryEnabled && (!Number.isSafeInteger(days) || days < 1))) { setMessage("#settings-status", "Revisá los valores de puntos y vencimiento."); return; }
    const next = { pesosPorPunto: pesos, puntosReferido: referidos, whatsapp: $("#settings-whatsapp").value.replace(/\D/g, ""), instagram: $("#settings-instagram").value.trim(), ubicacion: $("#settings-ubicacion").value.trim(), venceCupones: expiryEnabled, diasVencimiento: days, actualizadoEn: serverTimestamp() };
    const ref = doc(db, "configuracion", "negocio");
    const publicRef = doc(db, "configuracionPublica", "negocio");
    try {
      await runTransaction(db, async (transaction) => { await transaction.get(ref); await transaction.get(publicRef); transaction.set(ref, next, { merge: true }); transaction.set(publicRef, { whatsapp: next.whatsapp, instagram: next.instagram, ubicacion: next.ubicacion }, { merge: true }); await audit(transaction, { tipo: "administracion", descripcion: "Configuración del negocio actualizada", entidad: "configuracion", entidadId: "negocio" }); });
      await Promise.all([loadSettings(), loadPublicBusinessInfo()]); setMessage("#settings-status", "Configuración guardada y anotada en el historial."); await loadHistory();
    } catch { setMessage("#settings-status", "No se pudo guardar la configuración."); }
  });

  $("#add-purchase-line").addEventListener("click", addPurchaseLine);
  addPurchaseLine();
  purchaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const clientId = $("#purchase-client").value; const client = clientsById.get(clientId);
    const lines = $$(".purchase-line", purchaseLines).map((line) => ({ productId: $("select", line).value, quantity: Number($("input", line).value) }));
    if (!client || !lines.length || lines.some((line) => !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity < 1)) { setMessage(purchaseStatus, "Elegí un cliente, productos y cantidades enteras mayores a 0."); return; }
    const phone = normalizeArgentinePhone(clientId); if (!phone) { setMessage(purchaseStatus, "El celular del cliente necesita revisión antes de registrar la compra."); return; }
    const purchaseRef = doc(collection(db, "compras")); const clientRef = doc(db, "clientes", clientId); const publicRef = doc(db, "consultasPuntos", phone);
    const button = $("button[type='submit']", purchaseForm); button.disabled = true; setMessage(purchaseStatus, "Registrando compra…");
    try {
      const result = await runTransaction(db, async (transaction) => {
        const clientSnapshot = await transaction.get(clientRef); await transaction.get(publicRef);
        const productSnapshots = new Map();
        for (const line of lines) if (!productSnapshots.has(line.productId)) productSnapshots.set(line.productId, await transaction.get(doc(db, "productos", line.productId)));
        if (!clientSnapshot.exists()) throw new Error("missing-client");
        if (clientSnapshot.data().activo === false) throw new Error("inactive-client");
        const currentPoints = Number(clientSnapshot.data().puntos); if (!Number.isSafeInteger(currentPoints) || currentPoints < 0) throw new Error("invalid-balance");
        const items = lines.map((line) => {
          const snapshot = productSnapshots.get(line.productId); if (!snapshot.exists() || snapshot.data().activo === false || snapshot.data().archivado) throw new Error("inactive-product");
          const product = snapshot.data(); const price = Number(product.precio);
          if (!Number.isSafeInteger(price) || price < 1) throw new Error("invalid-price");
          return { productoId: line.productId, nombre: product.nombre, cantidad: line.quantity, precioUnitario: price, subtotal: price * line.quantity };
        });
        const total = items.reduce((sum, item) => sum + item.subtotal, 0); if (!Number.isSafeInteger(total)) throw new Error("invalid-total");
        const gained = Math.floor(total / (Number(settings.pesosPorPunto) || 100)); const balance = currentPoints + gained;
        transaction.update(clientRef, { puntos: balance, actualizadoEn: serverTimestamp() }); transaction.set(publicRef, { puntos: balance });
        transaction.set(purchaseRef, { clienteId: clientId, items, total, puntosSumados: gained, creadoEn: serverTimestamp(), creadoPor: auth.currentUser.uid });
        await audit(transaction, { tipo: "compra", descripcion: "Compra registrada", entidad: "compra", entidadId: purchaseRef.id, clienteId, puntos: gained, detalle: `${currency.format(total)} · ${items.map((item) => `${item.nombre} x${item.cantidad}`).join(", ")}`, extras: { importe: total, referenciaId: purchaseRef.id } });
        return { total, gained, balance };
      });
      setMessage(purchaseStatus, `Compra registrada: ${currency.format(result.total)}, +${result.gained} puntos. Saldo: ${result.balance}.`);
      purchaseLines.replaceChildren(); addPurchaseLine(); await Promise.all([loadClients(), loadHistory()]);
    } catch (error) {
      setMessage(purchaseStatus, ({ "missing-client": "No encontramos ese cliente.", "inactive-client": "Ese cliente está pausado y no puede registrar compras.", "invalid-balance": "El saldo actual necesita revisión.", "inactive-product": "Uno de los productos ya no está activo. Actualizá la compra.", "invalid-price": "El precio de un producto necesita revisión.", "invalid-total": "El total excede el valor permitido." })[error.message] || "No se pudo registrar la compra; no se aplicaron cambios.");
    } finally { button.disabled = false; }
  });

  $("#adjust-points-form").addEventListener("submit", async (event) => {
    event.preventDefault(); const clientId = $("#adjust-client").value; const amount = Number($("#adjust-amount").value); const reason = $("#adjust-reason").value.trim();
    const phone = normalizeArgentinePhone(clientId);
    if (!clientsById.has(clientId) || !Number.isSafeInteger(amount) || amount === 0 || !reason || !phone) { setMessage("#adjust-points-status", "Elegí un cliente, escribí un ajuste distinto de 0 y explicá el motivo."); return; }
    const clientRef = doc(db, "clientes", clientId); const publicRef = doc(db, "consultasPuntos", phone);
    try {
      await runTransaction(db, async (transaction) => {
        const clientSnapshot = await transaction.get(clientRef); await transaction.get(publicRef);
        if (!clientSnapshot.exists()) throw new Error("missing-client");
        const current = Number(clientSnapshot.data().puntos) || 0; const balance = current + amount; if (balance < 0) throw new Error("negative-balance");
        transaction.update(clientRef, { puntos: balance, actualizadoEn: serverTimestamp() }); transaction.set(publicRef, { puntos: balance });
        await audit(transaction, { tipo: "ajuste_puntos", descripcion: "Ajuste manual de puntos", entidad: "cliente", entidadId: clientId, clienteId, puntos: amount, detalle: reason });
      });
      $("#adjust-points-form").reset(); setMessage("#adjust-points-status", "Ajuste guardado en el historial."); await Promise.all([loadClients(), loadHistory()]);
    } catch (error) { setMessage("#adjust-points-status", error.message === "negative-balance" ? "El saldo no puede quedar por debajo de 0." : "No se pudo ajustar el saldo."); }
  });

  redemptionForm.addEventListener("submit", issueCoupon);
  $("#show-used-coupons").addEventListener("change", renderCoupons);
  $("#history-filter").addEventListener("change", renderHistory);
  $("#history-search").addEventListener("input", renderHistory);
} else {
  customerForm.addEventListener("submit", (event) => event.preventDefault());
  adminForm.addEventListener("submit", (event) => event.preventDefault());
}
