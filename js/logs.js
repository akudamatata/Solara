const form = document.getElementById("filtersForm");
const resetButton = document.getElementById("resetFilters");
const resultsBody = document.getElementById("resultsBody");
const resultsMeta = document.getElementById("resultsMeta");
const paginationInfo = document.getElementById("paginationInfo");
const prevButton = document.getElementById("prevPage");
const nextButton = document.getElementById("nextPage");
const resultsContainer = document.getElementById("resultsContainer");

const rowTemplate = document.getElementById("logRowTemplate");
const detailsTemplate = document.getElementById("logDetailsTemplate");

const state = {
    offset: 0,
    limit: 50,
    lastCount: 0,
    filters: {},
    loading: false,
};

function serializeFormData(formElement) {
    const data = new FormData(formElement);
    const params = {};
    for (const [key, value] of data.entries()) {
        if (value === "") continue;
        params[key] = value;
    }
    return params;
}

function formatDate(isoString) {
    if (!isoString) {
        return "-";
    }
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
        return isoString;
    }
    return date.toLocaleString("zh-CN", {
        hour12: false,
    });
}

function formatDuration(duration) {
    if (duration === null || duration === undefined) {
        return "-";
    }
    return `${Math.round(duration)} ms`;
}

function formatUrl(method, url) {
    const urlEl = document.createElement("div");
    urlEl.innerHTML = `
        <span class="badge badge--method">${method}</span>
        <div class="muted-text">${url}</div>
    `;
    return urlEl;
}

function formatStatus(status, duration) {
    const badge = document.createElement("span");
    badge.className = "badge badge--status";
    if (typeof status === "number") {
        if (status >= 200 && status < 300) {
            badge.classList.add("badge--status-success");
        } else if (status >= 400) {
            badge.classList.add("badge--status-error");
        }
    }
    badge.textContent = String(status ?? "-");

    const container = document.createElement("div");
    container.appendChild(badge);

    const durationText = document.createElement("div");
    durationText.className = "muted-text";
    durationText.textContent = `耗时 ${formatDuration(duration)}`;
    container.appendChild(durationText);

    return container;
}

function createDetails(requestBody, responseBody) {
    const details = detailsTemplate.content.firstElementChild.cloneNode(true);
    const [requestPre, responsePre] = details.querySelectorAll(".details__pre");
    requestPre.textContent = formatPayload(requestBody);
    responsePre.textContent = formatPayload(responseBody);
    return details;
}

function formatPayload(payload) {
    if (!payload) {
        return "(空)";
    }
    try {
        const parsed = JSON.parse(payload);
        return JSON.stringify(parsed, null, 2);
    } catch (error) {
        return payload;
    }
}

function updateResultsTable(rows) {
    resultsBody.innerHTML = "";

    if (!rows.length) {
        const emptyRow = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "results__placeholder";
        cell.textContent = "没有查询到任何日志记录。";
        emptyRow.appendChild(cell);
        resultsBody.appendChild(emptyRow);
        return;
    }

    for (const row of rows) {
        const tr = rowTemplate.content.firstElementChild.cloneNode(true);
        tr.querySelector(".col-time").textContent = formatDate(row.created_at);
        tr.querySelector(".col-source").textContent = row.source;

        const requestCell = tr.querySelector(".col-request");
        const requestContent = formatUrl(row.request_method, row.request_url);
        requestCell.appendChild(requestContent);

        const responseCell = tr.querySelector(".col-response");
        const responseContent = formatStatus(row.response_status, row.duration_ms);
        responseCell.appendChild(responseContent);

        const detailsCell = tr.querySelector(".col-details");
        detailsCell.appendChild(createDetails(row.request_body, row.response_body));

        resultsBody.appendChild(tr);
    }
}

function updateMeta(pagination) {
    const { limit, offset, count, hasMore } = pagination;
    state.limit = limit;
    state.lastCount = count;

    const start = count === 0 ? 0 : offset + 1;
    const end = offset + count;

    resultsMeta.textContent = `当前显示第 ${start}-${end} 条记录`;
    paginationInfo.textContent = `第 ${Math.floor(offset / limit) + 1} 页`;

    prevButton.disabled = offset === 0;
    nextButton.disabled = !hasMore;
}

async function fetchLogs() {
    if (state.loading) return;
    state.loading = true;
    setLoadingState(true);

    try {
        const params = new URLSearchParams();
        params.set("limit", String(state.limit));
        params.set("offset", String(state.offset));

        for (const [key, value] of Object.entries(state.filters)) {
            if (value) {
                params.set(key, value);
            }
        }

        const response = await fetch(`/logs?${params.toString()}`, {
            headers: {
                "Accept": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`查询失败：${response.status}`);
        }

        const result = await response.json();
        updateResultsTable(result.data ?? []);
        updateMeta(result.pagination ?? { limit: state.limit, offset: state.offset, count: 0, hasMore: false });

        if ((result.data ?? []).length > 0) {
            requestAnimationFrame(() => {
                resultsContainer.focus({ preventScroll: false });
            });
        }
    } catch (error) {
        console.error(error);
        showError(error instanceof Error ? error.message : "未知错误");
    } finally {
        setLoadingState(false);
        state.loading = false;
    }
}

function showError(message) {
    resultsBody.innerHTML = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "results__placeholder";
    cell.textContent = message;
    row.appendChild(cell);
    resultsBody.appendChild(row);
    resultsMeta.textContent = "";
    paginationInfo.textContent = "";
    prevButton.disabled = true;
    nextButton.disabled = true;
}

function setLoadingState(isLoading) {
    form.querySelectorAll("input, select, button").forEach((el) => {
        el.disabled = isLoading && el.type !== "button";
    });

    if (isLoading) {
        resultsMeta.textContent = "正在查询...";
    }
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    const filters = serializeFormData(form);
    state.filters = filters;
    state.limit = Number.parseInt(filters.limit ?? state.limit, 10) || state.limit;
    state.offset = 0;
    fetchLogs();
});

resetButton.addEventListener("click", () => {
    form.reset();
    state.filters = {};
    state.offset = 0;
    state.limit = 50;
    fetchLogs();
});

prevButton.addEventListener("click", () => {
    if (state.offset === 0) return;
    state.offset = Math.max(0, state.offset - state.limit);
    fetchLogs();
});

nextButton.addEventListener("click", () => {
    if (state.lastCount < state.limit) return;
    state.offset += state.limit;
    fetchLogs();
});

// 初始自动加载最近日志
fetchLogs();
