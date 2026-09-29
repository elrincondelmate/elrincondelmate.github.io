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
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { adminEmail, auth, db, isFirebaseConfigured, previousDb } from "./firebase.js";

const tabs = document.querySelectorAll("[data-view]");
const customerView = document.querySelector("#customer-view");
const adminView = document.querySelector("#admin-view");
const customerForm = document.querySelector("#customer-form");
const customerPhone = document.querySelector("#customer-phone");
const customerStatus = document.querySelector("#customer-status");
const customerAccount = document.querySelector("#customer-account");
const adminForm = document.querySelector("#admin-form");
const authStatus = document.querySelector("#auth-status");
const adminPanel = document.querySelector("#admin-panel");
const verificationStep = document.querySelector("#verification-step");
const clientsList = document.querySelector("#clients-list");
const importButton = document.querySelector("#import-previous-clients");
const importStatus = document.querySelector("#import-status");
const clientForm = document.querySelector("#client-form");
const productForm = document.querySelector("#product-form");
const productsList = document.querySelector("#products-list");
const purchaseForm = document.querySelector("#purchase-form");
const purchaseLines = document.querySelector("#purchase-lines");
const purchaseClient = document.querySelector("#purchase-client");
const purchaseStatus = document.querySelector("#purchase-status");
const redemptionForm = document.querySelector("#redemption-form");
const redemptionStatus = document.querySelector("#redemption-status");
const adminSubmit = adminForm.querySelector("button[type='submit']");
const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

let clientsById = new Map();
let productsById = new Map();

function showView(viewName) {
  const isAdminView = viewName === "admin";
  customerView.hidden = isAdminView;
  adminView.hidden = !isAdminView;
  customerView.classList.toggle("is-hidden", isAdminView);
  adminView.classList.toggle("is-hidden", !isAdminView);
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewName));
}

function setCustomerMessage(message) {
  customerStatus.textContent = message;
}

function showCustomerAccount(points) {
  customerForm.hidden = true;
  customerAccount.hidden = false;
  customerAccount.classList.remove("is-hidden");
  document.querySelector("#customer-greeting").textContent = "Tus puntos";
  document.querySelector("#customer-points").textContent = String(points);

  const rewardsList = document.querySelector("#customer-rewards");
  rewardsList.replaceChildren();
  [
    { points: 500, name: "10% de descuento en yerba" },
    { points: 750, name: "10% de descuento en otros productos" },
  ].forEach((reward) => {
    const item = document.createElement("div");
    item.className = "reward-item";
    const description = document.createElement("span");
    description.textContent = reward.name;
    const progress = document.createElement("span");
    progress.textContent = points >= reward.points
      ? "Disponible"
      : `Faltan ${reward.points - points} puntos`;
    item.append(description, progress);
    rewardsList.append(item);
  });
}

function hideCustomerAccount() {
  customerForm.hidden = false;
  customerAccount.hidden = true;
  customerAccount.classList.add("is-hidden");
}

function clientName(data) {
  return [data.nombre, data.apellido].filter(Boolean).join(" ").trim() || "Cliente";
}

function normalizeArgentinePhone(value) {
  const digits = String(value).replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return digits.slice(1);
  if (/^54\d{10}$/.test(digits)) return digits.slice(2);
  if (/^549\d{10}$/.test(digits)) return digits.slice(3);
  return null;
}

function updateClientChoices() {
  [purchaseClient, document.querySelector("#redemption-client")].forEach((select) => {
    const selected = select.value;
    select.replaceChildren(new Option("Elegí un cliente…", ""));
    [...clientsById.entries()]
      .sort((a, b) => clientName(a[1]).localeCompare(clientName(b[1]), "es"))
      .forEach(([id, data]) => {
        select.add(new Option(`${clientName(data)} · ${id}`, id));
      });
    if (clientsById.has(selected)) select.value = selected;
  });
}

function updatePurchaseProductChoices(select) {
  const selected = select.value;
  select.replaceChildren(new Option("Elegí un producto…", ""));
  [...productsById.entries()]
    .filter(([, product]) => product.activo !== false)
    .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"))
    .forEach(([id, product]) => {
      select.add(new Option(`${product.nombre} · ${currency.format(product.precio)}`, id));
    });
  if (productsById.has(selected) && productsById.get(selected).activo !== false) select.value = selected;
}

function updatePurchaseSummary() {
  let total = 0;
  purchaseLines.querySelectorAll(".purchase-line").forEach((line) => {
    const product = productsById.get(line.querySelector("select").value);
    const quantity = Number(line.querySelector("input").value);
    const subtotal = product && Number.isSafeInteger(quantity) && quantity > 0
      ? product.precio * quantity
      : 0;
    line.querySelector(".line-subtotal").textContent = currency.format(subtotal);
    total += subtotal;
  });
  document.querySelector("#purchase-total").textContent = currency.format(total);
  document.querySelector("#purchase-points").textContent = String(Math.floor(total / 100));
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
  remove.addEventListener("click", () => {
    line.remove();
    updatePurchaseSummary();
  });
  product.addEventListener("change", updatePurchaseSummary);
  quantity.addEventListener("input", updatePurchaseSummary);
  line.append(product, quantity, subtotal, remove);
  purchaseLines.append(line);
  updatePurchaseSummary();
}

async function loadClients() {
  clientsList.replaceChildren();
  clientsById.clear();
  const snapshot = await getDocs(collection(db, "clientes"));
  snapshot.docs.forEach((client) => clientsById.set(client.id, client.data()));
  updateClientChoices();

  if (snapshot.empty) {
    clientsList.textContent = "No hay clientes todavía. Importá los anteriores o agregá uno nuevo.";
    return;
  }

  snapshot.docs
    .sort((a, b) => clientName(a.data()).localeCompare(clientName(b.data()), "es"))
    .forEach((client) => {
      const data = client.data();
      const row = document.createElement("div");
      row.className = "client-row";
      const summary = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = clientName(data);
      const points = document.createElement("span");
      points.textContent = `${Number(data.puntos) || 0} puntos · ${client.id}`;
      summary.append(name, points);
      const button = document.createElement("button");
      button.className = "button button-secondary";
      button.type = "button";
      button.textContent = "Actualizar consulta";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const phone = normalizeArgentinePhone(client.id);
          if (!phone) throw new Error("Este cliente no tiene un celular argentino válido como identificador.");
          const balance = Number(data.puntos);
          if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("El saldo de este cliente necesita revisión.");
          await setDoc(doc(db, "consultasPuntos", phone), { puntos: balance });
          button.textContent = "Consulta actualizada";
        } catch (error) {
          authStatus.textContent = error.message || "No se pudo actualizar la consulta pública.";
        } finally {
          button.disabled = false;
        }
      });
      row.append(summary, button);
      clientsList.append(row);
    });
}

async function loadProducts() {
  productsList.replaceChildren();
  productsById.clear();
  const snapshot = await getDocs(collection(db, "productos"));
  snapshot.docs.forEach((product) => productsById.set(product.id, product.data()));
  purchaseLines.querySelectorAll(".purchase-line select").forEach(updatePurchaseProductChoices);
  updatePurchaseSummary();

  if (snapshot.empty) {
    productsList.textContent = "Agregá los productos que vendés para poder registrar compras.";
    return;
  }

  snapshot.docs
    .sort((a, b) => a.data().nombre.localeCompare(b.data().nombre, "es"))
    .forEach((productDoc) => {
      const product = productDoc.data();
      const row = document.createElement("div");
      row.className = "client-row";
      const summary = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = product.nombre;
      const price = document.createElement("span");
      price.textContent = `${currency.format(product.precio)}${product.activo === false ? " · pausado" : ""}`;
      summary.append(name, price);
      if (product.activo !== false) {
        const button = document.createElement("button");
        button.className = "text-button";
        button.type = "button";
        button.textContent = "Pausar";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await updateDoc(productDoc.ref, { activo: false });
            await loadProducts();
          } catch (error) {
            authStatus.textContent = "No se pudo pausar el producto.";
            button.disabled = false;
          }
        });
        row.append(summary, button);
      } else {
        row.append(summary);
      }
      productsList.append(row);
    });
}

async function importPreviousClients() {
  importButton.disabled = true;
  importStatus.textContent = "Buscando clientes en el sistema anterior…";
  try {
    const source = await getDocs(collection(previousDb, "clientes"));
    if (source.empty) {
      importStatus.textContent = "No encontramos clientes en el proyecto anterior.";
      return;
    }

    const entries = [];
    let invalid = 0;
    source.docs.forEach((client) => {
      const phone = normalizeArgentinePhone(client.id);
      const data = client.data();
      const points = Number(data.puntos);
      if (!phone || !Number.isSafeInteger(points) || points < 0) {
        invalid += 1;
        return;
      }
      entries.push({ phone, data, points });
    });

    if (!entries.length) {
      importStatus.textContent = `No había clientes importables. Registros para revisar: ${invalid}.`;
      return;
    }

    const approved = window.confirm(
      `Se encontraron ${entries.length} clientes válidos${invalid ? ` y ${invalid} registros para revisar` : ""}. `
      + "Se copiarán al proyecto nuevo sin borrar ni modificar los originales. "
      + "Los clientes que ya existan en el proyecto nuevo se saltearán. ¿Continuar?",
    );
    if (!approved) {
      importStatus.textContent = "Importación cancelada; no se modificó ningún dato.";
      return;
    }

    let imported = 0;
    let skipped = 0;
    for (const entry of entries) {
      const clientRef = doc(db, "clientes", entry.phone);
      const publicRef = doc(db, "consultasPuntos", entry.phone);
      const wasImported = await runTransaction(db, async (transaction) => {
        const existingClient = await transaction.get(clientRef);
        const existingPublic = await transaction.get(publicRef);
        if (existingClient.exists() || existingPublic.exists()) return false;
        transaction.set(clientRef, entry.data);
        transaction.set(publicRef, { puntos: entry.points });
        return true;
      });
      if (wasImported) imported += 1;
      else skipped += 1;
      if ((imported + skipped) % 10 === 0) {
        importStatus.textContent = `Importando… ${imported + skipped} de ${entries.length}`;
      }
    }

    await loadClients();
    importStatus.textContent = `Listo: ${imported} importados, ${skipped} ya existentes${invalid ? `, ${invalid} para revisar` : ""}. Los datos anteriores siguen intactos.`;
  } catch (error) {
    importStatus.textContent = "No se pudo leer o copiar la base anterior. No se borraron datos; avisame para revisar el acceso.";
  } finally {
    importButton.disabled = false;
  }
}

function createClientOptionValue(form) {
  const data = new FormData(form);
  return {
    nombre: String(data.get("nombre") || "").trim(),
    apellido: String(data.get("apellido") || "").trim(),
    phone: normalizeArgentinePhone(data.get("phone")),
  };
}

tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));

if (isFirebaseConfigured && adminEmail && !adminEmail.startsWith("REPLACE_WITH_")) {
  document.querySelector("#lookup-button").disabled = false;
  adminSubmit.disabled = false;
  setCustomerMessage("Ingresá los 10 números de tu celular.");
  authStatus.textContent = "Conectado. Ingresá con la cuenta administradora autorizada.";

  customerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = customerPhone.value.replace(/\D/g, "");
    if (!/^\d{10}$/.test(phone)) {
      setCustomerMessage("Ingresá los 10 números del celular, sin 0 ni 15.");
      return;
    }
    const button = document.querySelector("#lookup-button");
    button.disabled = true;
    setCustomerMessage("Buscando tus puntos…");
    try {
      const snapshot = await getDoc(doc(db, "consultasPuntos", phone));
      if (!snapshot.exists()) {
        setCustomerMessage("No encontramos puntos asociados a ese celular. Consultá en el local.");
        return;
      }
      const data = snapshot.data();
      showCustomerAccount(Number(data.puntos) || 0);
      setCustomerMessage("Para canjear una recompensa, acercate al local.");
    } catch (error) {
      setCustomerMessage("No pudimos consultar ahora. Intentá de nuevo más tarde.");
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#customer-signout").addEventListener("click", () => {
    hideCustomerAccount();
    customerPhone.value = "";
    setCustomerMessage("Consulta cerrada.");
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      adminPanel.hidden = true;
      adminPanel.classList.add("is-hidden");
      verificationStep.hidden = true;
      verificationStep.classList.add("is-hidden");
      return;
    }
    if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      await signOut(auth);
      authStatus.textContent = "Esta cuenta no es el correo administrador autorizado.";
      return;
    }
    if (!user.emailVerified) {
      adminPanel.hidden = true;
      adminPanel.classList.add("is-hidden");
      verificationStep.hidden = false;
      verificationStep.classList.remove("is-hidden");
      authStatus.textContent = "La cuenta es correcta, pero falta verificar el correo.";
      return;
    }
    verificationStep.hidden = true;
    verificationStep.classList.add("is-hidden");
    adminPanel.hidden = false;
    adminPanel.classList.remove("is-hidden");
    authStatus.textContent = `Sesión iniciada: ${user.email}`;
    try {
      await Promise.all([loadClients(), loadProducts()]);
    } catch (error) {
      authStatus.textContent = "No se pudo cargar la información. Revisá las reglas de Firestore.";
    }
  });

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(adminForm);
    adminSubmit.disabled = true;
    authStatus.textContent = "Verificando acceso…";
    try {
      await setPersistence(auth, browserSessionPersistence);
      await signInWithEmailAndPassword(auth, data.get("email"), data.get("password"));
    } catch (error) {
      authStatus.textContent = "No se pudo iniciar sesión. Revisá el correo y la contraseña.";
    } finally {
      adminForm.reset();
      adminSubmit.disabled = false;
    }
  });

  document.querySelector("#admin-signout").addEventListener("click", () => signOut(auth));
  document.querySelector("#send-verification-button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await sendEmailVerification(auth.currentUser);
      authStatus.textContent = "Enviamos un enlace de verificación. Revisá tu correo y también Spam.";
    } catch (error) {
      authStatus.textContent = "No se pudo enviar el correo. Esperá un momento e intentá nuevamente.";
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#check-verification-button").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await user.reload();
      await user.getIdToken(true);
      if (user.emailVerified) {
        verificationStep.hidden = true;
        verificationStep.classList.add("is-hidden");
        adminPanel.hidden = false;
        adminPanel.classList.remove("is-hidden");
        authStatus.textContent = `Sesión iniciada: ${user.email}`;
        await Promise.all([loadClients(), loadProducts()]);
      } else {
        authStatus.textContent = "Todavía no figura verificado. Abrí el enlace del correo y volvé a intentar.";
      }
    } catch (error) {
      authStatus.textContent = "No pudimos comprobar la verificación. Recargá la página e ingresá otra vez.";
    }
  });
  document.querySelector("#pending-signout-button").addEventListener("click", () => signOut(auth));

  importButton.addEventListener("click", importPreviousClients);
  clientForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const client = createClientOptionValue(clientForm);
    if (!client.nombre || !client.apellido || !client.phone) {
      authStatus.textContent = "Ingresá nombre, apellido y los 10 dígitos del celular.";
      return;
    }
    const clientRef = doc(db, "clientes", client.phone);
    const publicRef = doc(db, "consultasPuntos", client.phone);
    try {
      await runTransaction(db, async (transaction) => {
        const existingClient = await transaction.get(clientRef);
        const existingPublic = await transaction.get(publicRef);
        if (existingClient.exists() || existingPublic.exists()) throw new Error("duplicate-client");
        transaction.set(clientRef, {
          nombre: client.nombre,
          apellido: client.apellido,
          puntos: 0,
          creadoEn: serverTimestamp(),
        });
        transaction.set(publicRef, { puntos: 0 });
      });
      clientForm.reset();
      authStatus.textContent = "Cliente agregado con 0 puntos.";
      await loadClients();
    } catch (error) {
      authStatus.textContent = error.message === "duplicate-client"
        ? "Ya existe un cliente con ese celular."
        : "No se pudo agregar el cliente. Revisá las reglas de Firestore.";
    }
  });

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(productForm);
    const nombre = String(data.get("nombre") || "").trim();
    const precio = Number(data.get("precio"));
    if (!nombre || !Number.isSafeInteger(precio) || precio < 1) {
      authStatus.textContent = "Ingresá el nombre del producto y un precio entero mayor a 0.";
      return;
    }
    try {
      const productRef = doc(collection(db, "productos"));
      await setDoc(productRef, { nombre, precio, activo: true, creadoEn: serverTimestamp() });
      productForm.reset();
      authStatus.textContent = "Producto agregado al catálogo.";
      await loadProducts();
    } catch (error) {
      authStatus.textContent = "No se pudo agregar el producto.";
    }
  });

  document.querySelector("#add-purchase-line").addEventListener("click", addPurchaseLine);
  addPurchaseLine();
  purchaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const clientId = purchaseClient.value;
    const clientData = clientsById.get(clientId);
    const rawLines = [...purchaseLines.querySelectorAll(".purchase-line")].map((line) => ({
      productId: line.querySelector("select").value,
      quantity: Number(line.querySelector("input").value),
    }));
    if (!clientData || !rawLines.length || rawLines.some((line) => !line.productId || !Number.isSafeInteger(line.quantity) || line.quantity < 1)) {
      purchaseStatus.textContent = "Elegí un cliente, un producto y cantidades enteras mayores a 0.";
      return;
    }
    const normalizedPhone = normalizeArgentinePhone(clientId);
    if (!normalizedPhone) {
      purchaseStatus.textContent = "El celular del cliente necesita revisión antes de registrar la compra.";
      return;
    }
    const purchaseRef = doc(collection(db, "compras"));
    const movementRef = doc(collection(db, "movimientos"));
    const clientRef = doc(db, "clientes", clientId);
    const publicRef = doc(db, "consultasPuntos", normalizedPhone);
    const submitButton = purchaseForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    purchaseStatus.textContent = "Registrando compra…";
    try {
      const result = await runTransaction(db, async (transaction) => {
        const clientSnapshot = await transaction.get(clientRef);
        await transaction.get(publicRef);
        const productSnapshots = new Map();
        for (const line of rawLines) {
          if (!productSnapshots.has(line.productId)) {
            productSnapshots.set(line.productId, await transaction.get(doc(db, "productos", line.productId)));
          }
        }
        if (!clientSnapshot.exists()) throw new Error("missing-client");
        const pointsNow = Number(clientSnapshot.data().puntos);
        if (!Number.isSafeInteger(pointsNow) || pointsNow < 0) throw new Error("invalid-balance");
        const items = rawLines.map((line) => {
          const productSnapshot = productSnapshots.get(line.productId);
          if (!productSnapshot.exists() || productSnapshot.data().activo === false) throw new Error("inactive-product");
          const product = productSnapshot.data();
          const price = Number(product.precio);
          if (!Number.isSafeInteger(price) || price < 1) throw new Error("invalid-price");
          return {
            productoId: line.productId,
            nombre: product.nombre,
            cantidad: line.quantity,
            precioUnitario: price,
            subtotal: price * line.quantity,
          };
        });
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        if (!Number.isSafeInteger(total)) throw new Error("invalid-total");
        const pointsAdded = Math.floor(total / 100);
        const newBalance = pointsNow + pointsAdded;
        transaction.update(clientRef, { puntos: newBalance, actualizadoEn: serverTimestamp() });
        transaction.set(publicRef, { puntos: newBalance });
        transaction.set(purchaseRef, {
          clienteId: clientId,
          items,
          total,
          puntosSumados: pointsAdded,
          creadoEn: serverTimestamp(),
          creadoPor: auth.currentUser.uid,
        });
        transaction.set(movementRef, {
          clienteId: clientId,
          tipo: "compra",
          puntos: pointsAdded,
          importe: total,
          referenciaId: purchaseRef.id,
          creadoEn: serverTimestamp(),
          creadoPor: auth.currentUser.uid,
        });
        return { total, pointsAdded, newBalance };
      });
      purchaseStatus.textContent = `Compra registrada: ${currency.format(result.total)}, +${result.pointsAdded} puntos. Saldo: ${result.newBalance}.`;
      purchaseLines.replaceChildren();
      addPurchaseLine();
      await loadClients();
    } catch (error) {
      const messages = {
        "missing-client": "No encontramos ese cliente.",
        "invalid-balance": "El saldo actual necesita revisión antes de sumar puntos.",
        "inactive-product": "Uno de los productos ya no está activo. Actualizá la compra e intentá de nuevo.",
        "invalid-price": "El precio de un producto necesita revisión.",
        "invalid-total": "El total excede el valor permitido.",
      };
      purchaseStatus.textContent = messages[error.message] || "No se pudo registrar la compra. No se aplicaron cambios.";
    } finally {
      submitButton.disabled = false;
    }
  });

  redemptionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const clientId = document.querySelector("#redemption-client").value;
    const clientData = clientsById.get(clientId);
    const pointsToRedeem = Number(document.querySelector("#redemption-reward").value);
    const rewardName = pointsToRedeem === 500
      ? "10% de descuento en yerba"
      : "10% de descuento en otros productos";
    if (!clientData || ![500, 750].includes(pointsToRedeem)) {
      redemptionStatus.textContent = "Elegí el cliente presente y una recompensa válida.";
      return;
    }
    const normalizedPhone = normalizeArgentinePhone(clientId);
    if (!normalizedPhone) {
      redemptionStatus.textContent = "El celular del cliente necesita revisión antes de confirmar el canje.";
      return;
    }
    if (!window.confirm(`¿Confirmás el canje presencial de “${rewardName}” para ${clientName(clientData)}? Se descontarán ${pointsToRedeem} puntos.`)) return;

    const redemptionRef = doc(collection(db, "canjes"));
    const movementRef = doc(collection(db, "movimientos"));
    const clientRef = doc(db, "clientes", clientId);
    const publicRef = doc(db, "consultasPuntos", normalizedPhone);
    const submitButton = redemptionForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    redemptionStatus.textContent = "Confirmando canje…";
    try {
      const balance = await runTransaction(db, async (transaction) => {
        const clientSnapshot = await transaction.get(clientRef);
        await transaction.get(publicRef);
        if (!clientSnapshot.exists()) throw new Error("missing-client");
        const currentPoints = Number(clientSnapshot.data().puntos);
        if (!Number.isSafeInteger(currentPoints) || currentPoints < pointsToRedeem) throw new Error("insufficient-points");
        const newBalance = currentPoints - pointsToRedeem;
        transaction.update(clientRef, { puntos: newBalance, actualizadoEn: serverTimestamp() });
        transaction.set(publicRef, { puntos: newBalance });
        transaction.set(redemptionRef, {
          clienteId: clientId,
          recompensa: rewardName,
          puntosConsumidos: pointsToRedeem,
          confirmadoEn: serverTimestamp(),
          confirmadoPor: auth.currentUser.uid,
        });
        transaction.set(movementRef, {
          clienteId: clientId,
          tipo: "canje",
          puntos: -pointsToRedeem,
          referenciaId: redemptionRef.id,
          creadoEn: serverTimestamp(),
          creadoPor: auth.currentUser.uid,
        });
        return newBalance;
      });
      redemptionStatus.textContent = `Canje confirmado. Le quedan ${balance} puntos a ${clientName(clientData)}.`;
      await loadClients();
    } catch (error) {
      redemptionStatus.textContent = error.message === "insufficient-points"
        ? "El cliente no tiene puntos suficientes para esa recompensa."
        : "No se pudo confirmar el canje. No se aplicaron cambios.";
    } finally {
      submitButton.disabled = false;
    }
  });
} else {
  customerForm.addEventListener("submit", (event) => event.preventDefault());
  adminForm.addEventListener("submit", (event) => event.preventDefault());
}
