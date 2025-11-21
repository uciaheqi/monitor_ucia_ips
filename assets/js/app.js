// Configuración para Google Sheets API y OAuth
// Complete estos valores con los datos de su proyecto en Google Cloud
const CLIENT_ID = "105432716361922120239.apps.googleusercontent.com";
const API_KEY = "d073135b5ce946b2577a46df5c4cd5beff5cfca0";
const SHEET_ID = "1r_OmMJirLBC33Gjtl-mzlAxYKodnK-ld1ARlei7ut7k";
const SHEET_NAME = "BASE_UCI"; // Ajuste si su pestaña tiene otro nombre

// Alcances y documentación de la API
const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
let gapiInited = false;
let gisInited = false;

let UCI_DATA = [];
let UCI_HEADER = [];

// Gráficos
let chartIngresos = null;
let chartEdad = null;

// Carga inicial de Google API
function gapiLoaded() {
    if (typeof gapi === "undefined") return;
    gapi.load("client", initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC]
        });
        gapiInited = true;
        maybeEnableAuth();
    } catch (err) {
        console.error("Error inicializando gapi", err);
        const status = document.getElementById("auth-status");
        if (status) status.textContent = "Error al inicializar cliente API";
    }
}

function gisLoaded() {
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: "" // Se setea dinámicamente
    });
    gisInited = true;
    maybeEnableAuth();
}

function maybeEnableAuth() {
    if (!gapiInited || !gisInited) return;
    const btnAuth = document.getElementById("btn-auth");
    if (btnAuth) {
        btnAuth.disabled = false;
        btnAuth.addEventListener("click", handleAuthClick);
    }
    const btnFiltros = document.getElementById("btn-aplicar-filtros");
    if (btnFiltros) btnFiltros.addEventListener("click", aplicarFiltros);
    const btnReset = document.getElementById("btn-reset-filtros");
    if (btnReset) btnReset.addEventListener("click", resetFiltros);

    const form = document.getElementById("form-registro");
    if (form) form.addEventListener("submit", handleRegistroSubmit);
}

function handleAuthClick() {
    const status = document.getElementById("auth-status");
    if (!tokenClient) {
        if (status) status.textContent = "Token client no inicializado";
        return;
    }

    tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error(resp);
            if (status) status.textContent = "Error en autenticación";
            return;
        }
        if (status) status.textContent = "Sesión iniciada";
        await loadData();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
        tokenClient.requestAccessToken({ prompt: "" });
    }
}

// Lectura de datos desde Google Sheets
async function loadData() {
    const status = document.getElementById("auth-status");
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: SHEET_NAME
        });

        const values = response.result.values;
        if (!values || values.length === 0) {
            if (status) status.textContent = "Hoja vacía o sin datos";
            UCI_DATA = [];
            UCI_HEADER = [];
            renderTabla();
            actualizarKpis();
            actualizarGraficos();
            return;
        }

        UCI_HEADER = values[0];
        UCI_DATA = values.slice(1).map((row) => {
            const obj = {};
            UCI_HEADER.forEach((col, idx) => {
                obj[col] = row[idx] !== undefined ? row[idx] : "";
            });
            return obj;
        });

        if (status) status.textContent = "Datos cargados (" + UCI_DATA.length + " filas)";

        renderTabla();
        actualizarKpis();
        actualizarGraficos();

    } catch (err) {
        console.error("Error al leer datos de Sheets", err);
        if (status) status.textContent = "Error al leer datos de Sheets";
    }
}

// Render de tabla
function renderTabla(dataOpt) {
    const data = dataOpt || UCI_DATA;
    const theadRow = document.getElementById("tabla-header");
    const tbody = document.getElementById("tabla-body");
    if (!theadRow || !tbody) return;

    theadRow.innerHTML = "";
    tbody.innerHTML = "";

    if (!UCI_HEADER || UCI_HEADER.length === 0) return;

    UCI_HEADER.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col;
        theadRow.appendChild(th);
    });

    data.forEach((row) => {
        const tr = document.createElement("tr");
        UCI_HEADER.forEach((col) => {
            const td = document.createElement("td");
            td.textContent = row[col] !== undefined ? row[col] : "";
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

// Conversión segura de fecha en formato ISO o dd/mm/aaaa
function parseFecha(valor) {
    if (!valor) return null;
    const v = String(valor).trim();
    if (!v) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const d = new Date(v + "T00:00:00");
        return isNaN(d.getTime()) ? null : d;
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
        const [d, m, a] = v.split("/").map((x) => parseInt(x, 10));
        if (!d || !m || !a) return null;
        const fecha = new Date(a, m - 1, d);
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const parsed = new Date(v);
    if (!isNaN(parsed.getTime())) return parsed;

    return null;
}

function diffDias(fechaIni, fechaFin) {
    if (!fechaIni || !fechaFin) return null;
    const ms = fechaFin.getTime() - fechaIni.getTime();
    return ms / (1000 * 60 * 60 * 24);
}

function toNumber(x) {
    if (x === null || x === undefined || x === "") return null;
    const v = String(x).replace(",", ".").trim();
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

// Cálculo de indicadores
function actualizarKpis(dataOpt) {
    const data = dataOpt || UCI_DATA;

    const total = data.length;
    const edades = [];
    let nF = 0;
    let nConSexo = 0;
    let nFallecidos = 0;
    let nConEstado = 0;

    data.forEach((row) => {
        const edad = toNumber(row["edad"] || row["Edad"] || row["EDAD"]);
        if (edad !== null) edades.push(edad);

        const sexo = (row["sexo"] || row["Sexo"] || row["SEXO"] || "").toString().trim().toUpperCase();
        if (sexo) {
            nConSexo += 1;
            if (sexo === "F" || sexo === "FEMENINO") nF += 1;
        }

        const estado = (row["estado_egreso"] || row["Estado egreso"] || row["CONDICION"] || row["condicion"] || "").toString().trim().toUpperCase();
        if (estado) {
            nConEstado += 1;
            if (estado.indexOf("FALLECID") >= 0) nFallecidos += 1;
        }
    });

    const kpiTotal = document.getElementById("kpi-total");
    const kpiEdadProm = document.getElementById("kpi-edad-prom");
    const kpiMujeres = document.getElementById("kpi-mujeres");
    const kpiMortalidad = document.getElementById("kpi-mortalidad");

    if (kpiTotal) kpiTotal.textContent = total.toString();

    if (kpiEdadProm) {
        if (edades.length === 0) {
            kpiEdadProm.textContent = "s/d";
        } else {
            const prom = edades.reduce((a, b) => a + b, 0) / edades.length;
            kpiEdadProm.textContent = prom.toFixed(1);
        }
    }

    if (kpiMujeres) {
        if (nConSexo === 0) {
            kpiMujeres.textContent = "s/d";
        } else {
            const pF = (100 * nF) / nConSexo;
            kpiMujeres.textContent = pF.toFixed(1) + " %";
        }
    }

    if (kpiMortalidad) {
        if (nConEstado === 0) {
            kpiMortalidad.textContent = "s/d";
        } else {
            const pM = (100 * nFallecidos) / nConEstado;
            kpiMortalidad.textContent = pM.toFixed(1) + " %";
        }
    }
}

// Filtros
function aplicarFiltros() {
    const fDesde = document.getElementById("f-fecha-desde");
    const fHasta = document.getElementById("f-fecha-hasta");
    const fSexo = document.getElementById("f-sexo");
    const fEstado = document.getElementById("f-estado");

    const vDesde = fDesde && fDesde.value ? new Date(fDesde.value + "T00:00:00") : null;
    const vHasta = fHasta && fHasta.value ? new Date(fHasta.value + "T00:00:00") : null;
    const vSexo = fSexo && fSexo.value ? fSexo.value.toString().trim().toUpperCase() : "";
    const vEstado = fEstado && fEstado.value ? fEstado.value.toString().trim().toUpperCase() : "";

    const dataFiltrada = UCI_DATA.filter((row) => {
        let ok = true;

        const fechaIngStr = row["fecha_ingreso"] || row["Fecha ingreso"] || row["FECHA_INGRESO"] || row["fecha_ingreso_uci"];
        const fIng = parseFecha(fechaIngStr);

        if (vDesde && fIng && fIng < vDesde) ok = false;
        if (vHasta && fIng && fIng > vHasta) ok = false;

        if (vSexo) {
            const sexo = (row["sexo"] || row["Sexo"] || row["SEXO"] || "").toString().trim().toUpperCase();
            if (sexo !== vSexo) ok = false;
        }

        if (vEstado) {
            const estado = (row["estado_egreso"] || row["Estado egreso"] || row["CONDICION"] || row["condicion"] || "").toString().trim().toUpperCase();
            if (estado.indexOf(vEstado) < 0) ok = false;
        }

        return ok;
    });

    renderTabla(dataFiltrada);
    actualizarKpis(dataFiltrada);
    actualizarGraficos(dataFiltrada);
}

function resetFiltros() {
    const ids = ["f-fecha-desde", "f-fecha-hasta", "f-sexo", "f-estado"];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    renderTabla(UCI_DATA);
    actualizarKpis(UCI_DATA);
    actualizarGraficos(UCI_DATA);
}

// Gráficos
function actualizarGraficos(dataOpt) {
    const data = dataOpt || UCI_DATA;
    actualizarGraficoIngresos(data);
    actualizarGraficoEdad(data);
}

function actualizarGraficoIngresos(data) {
    const ctx = document.getElementById("chart-ingresos");
    if (!ctx) return;

    const conteo = new Map();

    data.forEach((row) => {
        const fechaIngStr = row["fecha_ingreso"] || row["Fecha ingreso"] || row["FECHA_INGRESO"] || row["fecha_ingreso_uci"];
        const fIng = parseFecha(fechaIngStr);
        if (!fIng) return;
        const y = fIng.getFullYear();
        const m = (fIng.getMonth() + 1).toString().padStart(2, "0");
        const clave = y + "-" + m;
        conteo.set(clave, (conteo.get(clave) || 0) + 1);
    });

    const etiquetas = Array.from(conteo.keys()).sort();
    const valores = etiquetas.map((k) => conteo.get(k));

    const dataChart = {
        labels: etiquetas,
        datasets: [{
            label: "Ingresos UCI",
            data: valores
        }]
    };

    const opciones = {
        responsive: true,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                ticks: { color: "#cbd5f5" },
                grid: { color: "rgba(148,163,184,0.3)" }
            },
            y: {
                ticks: { color: "#cbd5f5" },
                grid: { color: "rgba(148,163,184,0.3)" }
            }
        }
    };

    if (chartIngresos) chartIngresos.destroy();
    chartIngresos = new Chart(ctx, {
        type: "bar",
        data: dataChart,
        options: opciones
    });
}

function actualizarGraficoEdad(data) {
    const ctx = document.getElementById("chart-edad");
    if (!ctx) return;

    const cortes = [0, 20, 40, 60, 80, 120];
    const etiquetas = ["0-19", "20-39", "40-59", "60-79", "80+"];
    const conteo = [0, 0, 0, 0, 0];

    data.forEach((row) => {
        const edad = toNumber(row["edad"] || row["Edad"] || row["EDAD"]);
        if (edad === null) return;
        if (edad < 20) conteo[0]++;
        else if (edad < 40) conteo[1]++;
        else if (edad < 60) conteo[2]++;
        else if (edad < 80) conteo[3]++;
        else conteo[4]++;
    });

    const dataChart = {
        labels: etiquetas,
        datasets: [{
            label: "Pacientes",
            data: conteo
        }]
    };

    const opciones = {
        responsive: true,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                ticks: { color: "#cbd5f5" },
                grid: { color: "rgba(148,163,184,0.3)" }
            },
            y: {
                ticks: { color: "#cbd5f5" },
                grid: { color: "rgba(148,163,184,0.3)" }
            }
        }
    };

    if (chartEdad) chartEdad.destroy();
    chartEdad = new Chart(ctx, {
        type: "bar",
        data: dataChart,
        options: opciones
    });
}

// Registro de nuevo caso, escritura en Google Sheets
async function handleRegistroSubmit(ev) {
    ev.preventDefault();
    const status = document.getElementById("registro-status");
    if (status) status.textContent = "";

    if (!gapiInited || !gapi.client || !gapi.client.sheets) {
        if (status) status.textContent = "Cliente API no inicializado";
        return;
    }

    const historia = document.getElementById("r-historia").value.trim();
    const fIng = document.getElementById("r-fecha-ingreso").value;
    const fEgr = document.getElementById("r-fecha-egreso").value;
    const edad = document.getElementById("r-edad").value.trim();
    const sexo = document.getElementById("r-sexo").value;
    const estado = document.getElementById("r-estado").value;
    const notas = document.getElementById("r-notas").value.trim();

    if (!historia || !fIng) {
        if (status) status.textContent = "Historia y fecha de ingreso son obligatorias";
        return;
    }

    const record = {
        "historia_clinica": historia,
        "fecha_ingreso": fIng,
        "fecha_egreso": fEgr || "",
        "edad": edad || "",
        "sexo": sexo || "",
        "estado_egreso": estado || "",
        "notas": notas || ""
    };

    try {
        const header = await obtenerHeaderDesdeSheets();
        const fila = header.map((col) => record[col] !== undefined ? record[col] : "");

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: SHEET_NAME,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            resource: {
                values: [fila]
            }
        });

        if (status) status.textContent = "Registro guardado correctamente";

        document.getElementById("form-registro").reset();

        await loadData();

    } catch (err) {
        console.error("Error al escribir en Sheets", err);
        if (status) status.textContent = "Error al guardar registro";
    }
}

async function obtenerHeaderDesdeSheets() {
    if (UCI_HEADER && UCI_HEADER.length > 0) return UCI_HEADER;

    const respuesta = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: SHEET_NAME + "!1:1"
    });
    const values = respuesta.result.values;
    if (!values || values.length === 0) return [];
    UCI_HEADER = values[0];
    return UCI_HEADER;
}

// Inicialización básica del DOM
document.addEventListener("DOMContentLoaded", () => {
    const status = document.getElementById("auth-status");
    if (status) status.textContent = "Desconectado (espere carga de librerías Google)";
});
