// Configuración principal
const SHEET_ID = "1r_OmMJirLBC33Gjtl-mzlAxYKodnK-ld1ARlei7ut7k";
const SHEET_NAME = "BASE_UCI";

// Debe crear un ID de cliente OAuth 2.0 para aplicación web
// en Google Cloud Console y una API Key del mismo proyecto.
// No se recomienda exponer credenciales de cuenta de servicio en un frontend estático.
const CLIENT_ID = "REEMPLAZAR_POR_CLIENT_ID_WEB.apps.googleusercontent.com";
const API_KEY = "REEMPLAZAR_POR_API_KEY";

// Ámbitos requeridos
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";

// Estado global
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

let header = [];
let rawData = [];
let filteredData = [];

let chartIngresos = null;
let chartEdades = null;

// Utilidades

function parseDateOrNull(value) {
    if (!value) return null;

    // Caso ISO o similar
    const d1 = new Date(value);
    if (!isNaN(d1.getTime())) return d1;

    // Caso dd/mm/aaaa
    if (typeof value === "string" && value.includes("/")) {
        const parts = value.split("/");
        if (parts.length === 3) {
            const [dd, mm, yyyy] = parts;
            const d2 = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
            if (!isNaN(d2.getTime())) return d2;
        }
    }

    return null;
}

function parseNumberOrNull(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return isNaN(value) ? null : value;
    const cleaned = String(value).replace(",", ".").replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
}

function normalizarTexto(value) {
    if (!value) return "";
    return String(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Inicialización GAPI y GIS

window.gapiLoaded = function gapiLoaded() {
    gapi.load("client", initializeGapiClient);
};

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC]
        });
        gapiInited = true;
        maybeEnableConnect();
    } catch (err) {
        console.error("Error inicializando gapi", err);
        setAuthStatus("Error inicializando cliente API", false);
    }
}

window.gisLoaded = function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
            if (resp && resp.access_token) {
                accessToken = resp.access_token;
                gapi.client.setToken({ access_token: accessToken });
                setAuthStatus("Conectado", true);
                await loadSheetData();
            }
        },
    });
    gisInited = true;
    maybeEnableConnect();
};

function maybeEnableConnect() {
    if (gapiInited && gisInited) {
        const btn = document.getElementById("btnConnect");
        btn.disabled = false;
        btn.addEventListener("click", handleAuthClick);
    }
}

function handleAuthClick() {
    if (!accessToken) {
        tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
        loadSheetData();
    }
}

// Lectura de datos

async function loadSheetData() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: SHEET_NAME
        });

        const values = response.result.values || [];
        if (!values.length) {
            header = [];
            rawData = [];
            filteredData = [];
            renderAll();
            return;
        }

        header = values[0].map(h => String(h).trim());
        rawData = values.slice(1).map(row => {
            const obj = {};
            header.forEach((col, idx) => {
                obj[col] = row[idx] !== undefined ? row[idx] : "";
            });
            return obj;
        });
        filteredData = rawData.slice();
        renderAll();
    } catch (err) {
        console.error("Error leyendo la hoja", err);
        setAuthStatus("Error leyendo datos", false);
    }
}

// Escritura de datos

async function appendRecord(record) {
    if (!header.length) {
        throw new Error("No hay encabezados definidos en la hoja");
    }
    const rowToAppend = header.map(col => record[col] !== undefined ? record[col] : "");
    const req = {
        spreadsheetId: SHEET_ID,
        range: SHEET_NAME,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        resource: {
            values: [rowToAppend]
        }
    };
    await gapi.client.sheets.spreadsheets.values.append(req);
}

// Renderizado general

function renderAll() {
    updateKpis();
    updateCharts();
    updateTable();
    document.getElementById("sheetIdLabel").textContent = SHEET_ID;
    document.getElementById("sheetNameLabel").textContent = SHEET_NAME;
}

// KPIs

function updateKpis() {
    const kpiTotalPacientes = document.getElementById("kpiTotalPacientes");
    const kpiEdadMedia = document.getElementById("kpiEdadMedia");
    const kpiFem = document.getElementById("kpiFem");
    const kpiMort = document.getElementById("kpiMort");

    if (!filteredData.length) {
        kpiTotalPacientes.textContent = "0";
        kpiEdadMedia.textContent = "–";
        kpiFem.textContent = "–";
        kpiMort.textContent = "–";
        return;
    }

    const colFechaIng = buscarColumna(["fecha_de_ingreso", "fecha_ingreso", "fecha ingreso"]);
    const colEdad = buscarColumna(["edad"]);
    const colSexo = buscarColumna(["sexo"]);
    const colCond = buscarColumna(["condicion_al_egreso", "condicion egreso", "estado_egreso"]);

    let totalPacientes = 0;
    let sumEdad = 0;
    let nEdad = 0;
    let nFem = 0;
    let nSexo = 0;
    let nObito = 0;
    let nCond = 0;

    for (const r of filteredData) {
        if (colFechaIng && parseDateOrNull(r[colFechaIng])) {
            totalPacientes += 1;
        }

        if (colEdad) {
            const e = parseNumberOrNull(r[colEdad]);
            if (e !== null) {
                sumEdad += e;
                nEdad += 1;
            }
        }

        if (colSexo) {
            const sx = normalizarTexto(r[colSexo]);
            if (sx) {
                nSexo += 1;
                if (sx.startsWith("f")) nFem += 1;
            }
        }

        if (colCond) {
            const c = normalizarTexto(r[colCond]);
            if (c) {
                nCond += 1;
                if (c.includes("obito") || c.includes("óbito") || c.includes("falle")) {
                    nObito += 1;
                }
            }
        }
    }

    kpiTotalPacientes.textContent = String(totalPacientes);
    kpiEdadMedia.textContent = nEdad > 0 ? (sumEdad / nEdad).toFixed(1) : "–";
    kpiFem.textContent = nSexo > 0 ? (100 * nFem / nSexo).toFixed(1) + " %" : "–";
    kpiMort.textContent = nCond > 0 ? (100 * nObito / nCond).toFixed(1) + " %" : "–";
}

// Gráficos

function updateCharts() {
    updateChartIngresos();
    updateChartEdades();
}

function updateChartIngresos() {
    const canvas = document.getElementById("chartIngresos");
    if (!canvas) return;

    const colFechaIng = buscarColumna(["fecha_de_ingreso", "fecha_ingreso", "fecha ingreso"]);
    if (!colFechaIng || !filteredData.length) {
        if (chartIngresos) {
            chartIngresos.destroy();
            chartIngresos = null;
        }
        return;
    }

    const counts = new Map();

    for (const r of filteredData) {
        const d = parseDateOrNull(r[colFechaIng]);
        if (!d) continue;
        const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    const labels = Array.from(counts.keys()).sort();
    const data = labels.map(k => counts.get(k));

    if (chartIngresos) {
        chartIngresos.destroy();
    }

    chartIngresos = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Ingresos por mes",
                data,
                tension: 0.25
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#e5e7eb" } }
            },
            scales: {
                x: {
                    ticks: { color: "#9ca3af" },
                    grid: { color: "rgba(55,65,81,0.4)" }
                },
                y: {
                    ticks: { color: "#9ca3af" },
                    grid: { color: "rgba(55,65,81,0.4)" }
                }
            }
        }
    });
}

function updateChartEdades() {
    const canvas = document.getElementById("chartEdades");
    if (!canvas) return;

    const colEdad = buscarColumna(["edad"]);
    if (!colEdad || !filteredData.length) {
        if (chartEdades) {
            chartEdades.destroy();
            chartEdades = null;
        }
        return;
    }

    const bins = [
        { label: "< 30", min: 0, max: 29 },
        { label: "30 – 44", min: 30, max: 44 },
        { label: "45 – 59", min: 45, max: 59 },
        { label: "60 – 74", min: 60, max: 74 },
        { label: "≥ 75", min: 75, max: Infinity }
    ];

    const counts = new Array(bins.length).fill(0);

    for (const r of filteredData) {
        const e = parseNumberOrNull(r[colEdad]);
        if (e === null) continue;
        for (let i = 0; i < bins.length; i++) {
            if (e >= bins[i].min && e <= bins[i].max) {
                counts[i] += 1;
                break;
            }
        }
    }

    const labels = bins.map(b => b.label);

    if (chartEdades) {
        chartEdades.destroy();
    }

    chartEdades = new Chart(canvas.getContext("2d"), {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Pacientes por grupo de edad",
                data: counts
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#e5e7eb" } }
            },
            scales: {
                x: {
                    ticks: { color: "#9ca3af" },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: "#9ca3af" },
                    grid: { color: "rgba(55,65,81,0.4)" }
                }
            }
        }
    });
}

// Tabla

function updateTable() {
    const headRow = document.getElementById("tableHeadRow");
    const body = document.getElementById("tableBody");
    const summary = document.getElementById("tableSummary");

    headRow.innerHTML = "";
    body.innerHTML = "";

    if (!header.length) {
        summary.textContent = "0 registros";
        return;
    }

    for (const col of header) {
        const th = document.createElement("th");
        th.textContent = col;
        headRow.appendChild(th);
    }

    for (const r of filteredData) {
        const tr = document.createElement("tr");
        for (const col of header) {
            const td = document.createElement("td");
            td.textContent = r[col] !== undefined ? r[col] : "";
            tr.appendChild(td);
        }
        body.appendChild(tr);
    }

    summary.textContent = filteredData.length + " registros";
}

// Filtros

function aplicarFiltros() {
    if (!rawData.length) {
        filteredData = [];
        renderAll();
        return;
    }

    const colFechaIng = buscarColumna(["fecha_de_ingreso", "fecha_ingreso", "fecha ingreso"]);
    const colSexo = buscarColumna(["sexo"]);
    const colCond = buscarColumna(["condicion_al_egreso", "condicion egreso", "estado_egreso"]);

    const fDesde = document.getElementById("fDesde").value;
    const fHasta = document.getElementById("fHasta").value;
    const fSexo = document.getElementById("fSexo").value;
    const fCond = document.getElementById("fCond").value;

    const dDesde = fDesde ? new Date(fDesde) : null;
    const dHasta = fHasta ? new Date(fHasta) : null;

    filteredData = rawData.filter(r => {
        // Fecha ingreso
        if (colFechaIng) {
            const d = parseDateOrNull(r[colFechaIng]);
            if (dDesde && (!d || d < dDesde)) return false;
            if (dHasta && (!d || d > dHasta)) return false;
        }

        // Sexo
        if (fSexo && colSexo) {
            const sx = normalizarTexto(r[colSexo]);
            if (!sx.startsWith(fSexo.toLowerCase())) return false;
        }

        // Condición
        if (fCond && colCond) {
            const c = normalizarTexto(r[colCond]);
            if (!c) return false;
            if (fCond === "vivo" && !(c.includes("vivo") || c.includes("alta"))) return false;
            if (fCond === "obito" && !(c.includes("obito") || c.includes("óbito") || c.includes("falle"))) return false;
        }

        return true;
    });

    renderAll();
}

function limpiarFiltros() {
    document.getElementById("fDesde").value = "";
    document.getElementById("fHasta").value = "";
    document.getElementById("fSexo").value = "";
    document.getElementById("fCond").value = "";
    filteredData = rawData.slice();
    renderAll();
}

// Búsqueda en tabla

function aplicarBusqueda() {
    const q = normalizarTexto(document.getElementById("searchBox").value);
    if (!q) {
        filteredData = rawData.slice();
        renderAll();
        return;
    }

    filteredData = rawData.filter(r => {
        return Object.values(r).some(v => normalizarTexto(v).includes(q));
    });
    renderAll();
}

// Formularios

function setAuthStatus(text, connected) {
    const el = document.getElementById("authStatus");
    el.textContent = text;
    el.classList.toggle("status-connected", !!connected);
    el.classList.toggle("status-disconnected", !connected);
}

function setFormStatus(text, type) {
    const el = document.getElementById("formStatus");
    el.textContent = text || "";
    el.style.color = type === "error" ? "#f97373" : type === "success" ? "#22c55e" : "#9ca3af";
}

// Búsqueda de columnas por nombre aproximado

function buscarColumna(candidatos) {
    if (!header || !header.length) return null;
    const normHeader = header.map(h => normalizarTexto(h));
    for (const cand of candidatos) {
        const nc = normalizarTexto(cand);
        const idx = normHeader.findIndex(h => h === nc);
        if (idx !== -1) return header[idx];
    }
    // búsqueda parcial
    for (const cand of candidatos) {
        const nc = normalizarTexto(cand);
        const idx = normHeader.findIndex(h => h.includes(nc));
        if (idx !== -1) return header[idx];
    }
    return null;
}

// Eventos DOM

document.addEventListener("DOMContentLoaded", () => {
    const btnFiltros = document.getElementById("btnAplicarFiltros");
    const btnLimpiar = document.getElementById("btnLimpiarFiltros");
    const searchBox = document.getElementById("searchBox");
    const form = document.getElementById("recordForm");

    if (btnFiltros) btnFiltros.addEventListener("click", aplicarFiltros);
    if (btnLimpiar) btnLimpiar.addEventListener("click", limpiarFiltros);
    if (searchBox) searchBox.addEventListener("input", () => {
        aplicarBusqueda();
    });

    if (form) {
        form.addEventListener("submit", async (evt) => {
            evt.preventDefault();
            if (!accessToken) {
                setFormStatus("Debe conectar primero con Google para guardar.", "error");
                return;
            }
            if (!header.length) {
                setFormStatus("No se han podido leer los encabezados de la hoja.", "error");
                return;
            }

            const record = {};

            // Mapeo principal de campos
            const colNombre = buscarColumna(["nombre_y_apellido", "nombre y apellido", "paciente"]);
            const colFechaIng = buscarColumna(["fecha_de_ingreso", "fecha_ingreso", "fecha ingreso"]);
            const colFechaEgr = buscarColumna(["fecha_de_egreso", "fecha_egreso", "fecha egreso"]);
            const colEdad = buscarColumna(["edad"]);
            const colSexo = buscarColumna(["sexo"]);
            const colCond = buscarColumna(["condicion_al_egreso", "condicion egreso", "estado_egreso"]);
            const colDiag = buscarColumna(["diagnostico", "diagnostico_principal"]);

            if (colNombre) record[colNombre] = document.getElementById("nombre").value.trim();
            if (colFechaIng) record[colFechaIng] = document.getElementById("fechaIng").value;
            if (colFechaEgr) record[colFechaEgr] = document.getElementById("fechaEgr").value;
            if (colEdad) record[colEdad] = document.getElementById("edad").value;
            if (colSexo) record[colSexo] = document.getElementById("sexoForm").value;
            if (colCond) record[colCond] = document.getElementById("condicion").value;
            if (colDiag) record[colDiag] = document.getElementById("diagnostico").value.trim();

            try {
                setFormStatus("Guardando registro en Google Sheets…", null);
                await appendRecord(record);
                setFormStatus("Registro guardado correctamente.", "success");
                form.reset();
                await loadSheetData();
            } catch (err) {
                console.error("Error guardando registro", err);
                setFormStatus("Error al guardar el registro.", "error");
            }
        });
    }
});
