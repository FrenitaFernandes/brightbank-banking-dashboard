
const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const $ = (selector) => document.querySelector(selector);

const state = {
  accounts: [],
  selectedAccountId: "",
  page: 1,
  limit: 10,
  totalPages: 1,
};

let noticeTimer;

function money(value) {
  const amount = Number(value ?? 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function dateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[char];
  });
}

function showNotice(message, kind = "success") {
  const notice = $("#notice");

  if (!notice) return;

  window.clearTimeout(noticeTimer);

  notice.textContent = message;
  notice.className =
    kind === "error"
      ? "notice notice-error"
      : "notice notice-success";

  notice.hidden = false;

  noticeTimer = window.setTimeout(() => {
    notice.hidden = true;
  }, 6000);
}

async function api(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Unable to connect to the backend. Check that your backend server is running and your API URL is correct."
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(
      payload.error?.message ||
        payload.message ||
        `Request failed with status ${response.status}. Please try again.`
    );
  }

  return payload;
}

function accountOptions(selectedId = state.selectedAccountId) {
  const options = state.accounts
    .map(
      (account) => `
        <option value="${escapeHtml(account.id)}">
          ${escapeHtml(account.name)} · ${money(account.balance)}
        </option>
      `
    )
    .join("");

  const transactionSelect = $("#transaction-account");
  const fromSelect = $("#from-account");
  const toSelect = $("#to-account");

  transactionSelect.innerHTML = `
    <option value="">Select an account</option>
    ${options}
  `;

  fromSelect.innerHTML = `
    <option value="">Select source account</option>
    ${options}
  `;

  toSelect.innerHTML = `
    <option value="">Select destination account</option>
    ${options}
  `;

  if (state.accounts.some((account) => account.id === selectedId)) {
    transactionSelect.value = selectedId;
  }
}

function renderAccounts() {
  $("#account-count").textContent = state.accounts.length;

  $("#accounts-pill").textContent =
    `${state.accounts.length} ` +
    `account${state.accounts.length === 1 ? "" : "s"}`;

  const combinedBalance = state.accounts.reduce(
    (total, account) => total + Number(account.balance || 0),
    0
  );

  $("#total-balance").textContent = money(combinedBalance);

  if (
    !state.accounts.some(
      (account) => account.id === state.selectedAccountId
    )
  ) {
    state.selectedAccountId = state.accounts[0]?.id || "";
  }

  const selectedAccount = state.accounts.find(
    (account) => account.id === state.selectedAccountId
  );

  $("#selected-name").textContent =
    selectedAccount?.name || "None selected";

  $("#selected-balance").textContent = selectedAccount
    ? `${money(selectedAccount.balance)} available balance`
    : "Choose an account below";

  const accountsList = $("#accounts-list");

  if (!state.accounts.length) {
    accountsList.innerHTML = `
      <div class="empty-state">
        No accounts yet. Create your first account above.
      </div>
    `;
  } else {
    accountsList.innerHTML = state.accounts
      .map((account) => {
        const isSelected =
          account.id === state.selectedAccountId;

        const initial =
          account.name?.trim().charAt(0).toUpperCase() || "A";

        return `
          <button
            class="account-item ${isSelected ? "account-item-active" : ""}"
            data-account-id="${escapeHtml(account.id)}"
            type="button"
            aria-pressed="${isSelected}"
          >
            <span class="account-avatar">
              ${escapeHtml(initial)}
            </span>

            <span class="account-info">
              <strong>${escapeHtml(account.name)}</strong>
              <small>Created ${dateTime(account.created_at)}</small>
            </span>

            <span class="account-balance">
              ${money(account.balance)}
              <small>Available balance</small>
            </span>
          </button>
        `;
      })
      .join("");
  }

  accountOptions();
}

function renderEmptyHistory(message) {
  $("#transactions-body").innerHTML = `
    <tr>
      <td colspan="4" class="empty-cell">
        ${escapeHtml(message)}
      </td>
    </tr>
  `;

  $("#page-label").textContent = "Page 1 of 1";
  $("#prev-page").disabled = true;
  $("#next-page").disabled = true;
}

async function loadTransactions() {
  const account = state.accounts.find(
    (item) => item.id === state.selectedAccountId
  );

  if (!account) {
    $("#history-subtitle").textContent =
      "Select an account to view its transactions.";

    renderEmptyHistory(
      "Create or select an account to get started."
    );

    return;
  }

  $("#history-subtitle").textContent =
    `Recent activity for ${account.name}`;

  const query = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit),
  });

  const payload = await api(
    `/accounts/${encodeURIComponent(account.id)}/transactions?${query}`
  );

  const transactions = Array.isArray(payload.data)
    ? payload.data
    : [];

  const pagination = payload.pagination || {};

  state.totalPages = Math.max(
    Number(pagination.totalPages) || 1,
    1
  );

  // Keep the current page valid if records have changed.
  if (state.page > state.totalPages) {
    state.page = state.totalPages;

    const correctedQuery = new URLSearchParams({
      page: String(state.page),
      limit: String(state.limit),
    });

    const correctedPayload = await api(
      `/accounts/${encodeURIComponent(account.id)}/transactions?${correctedQuery}`
    );

    const correctedTransactions = Array.isArray(
      correctedPayload.data
    )
      ? correctedPayload.data
      : [];

    state.totalPages = Math.max(
      Number(correctedPayload.pagination?.totalPages) || 1,
      1
    );

    renderTransactions(correctedTransactions);
    return;
  }

  renderTransactions(transactions);
}

function renderTransactions(transactions) {
  if (!transactions.length) {
    renderEmptyHistory("No transactions for this account yet.");
    return;
  }

  $("#transactions-body").innerHTML = transactions
    .map((transaction) => {
      const isCredit = transaction.type === "credit";
      const typeClass = isCredit ? "credit" : "debit";
      const typeLabel = isCredit ? "Credit" : "Debit";
      const sign = isCredit ? "+" : "−";

      return `
        <tr>
          <td>
            <span
              class="transaction-kind kind-${typeClass}"
              aria-hidden="true"
            >
              ${isCredit ? "✓" : "−"}
            </span>

            <span class="transaction-label">
              <strong>${typeLabel}</strong>
              <small>
                ${escapeHtml(
                  transaction.description || "Account transaction"
                )}
              </small>
            </span>
          </td>

          <td>
            <code>${escapeHtml(transaction.reference_id)}</code>
          </td>

          <td>${dateTime(transaction.created_at)}</td>

          <td class="align-right amount-${typeClass}">
            ${sign}${money(transaction.amount)}
          </td>
        </tr>
      `;
    })
    .join("");

  $("#page-label").textContent =
    `Page ${state.page} of ${state.totalPages}`;

  $("#prev-page").disabled = state.page <= 1;
  $("#next-page").disabled = state.page >= state.totalPages;
}

async function refresh({ keepPage = false } = {}) {
  const previousPage = state.page;
  const previousSelection = state.selectedAccountId;

  const payload = await api("/accounts");

  state.accounts = Array.isArray(payload.data)
    ? payload.data
    : [];

  state.selectedAccountId = state.accounts.some(
    (account) => account.id === previousSelection
  )
    ? previousSelection
    : state.accounts[0]?.id || "";

  state.page = keepPage ? previousPage : 1;

  renderAccounts();
  await loadTransactions();
}

// Create an account
$("#create-account-form").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const input = $("#account-name");
    const name = input.value.trim();

    if (!name) {
      showNotice("Please enter an account name.", "error");
      input.focus();
      return;
    }

    const submitButton = event.submitter;

    if (submitButton) submitButton.disabled = true;

    try {
      const result = await api("/accounts", {
        method: "POST",
        body: JSON.stringify({ name }),
      });

      state.selectedAccountId = result.data.id;
      state.page = 1;

      input.value = "";

      await refresh();

      showNotice("Account created successfully.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }
);

// Select an account from the accounts list
$("#accounts-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-account-id]");

  if (!button) return;

  state.selectedAccountId = button.dataset.accountId;
  state.page = 1;

  renderAccounts();

  try {
    await loadTransactions();
  } catch (error) {
    showNotice(error.message, "error");
  }
});

// Change the account from the transaction form
$("#transaction-account").addEventListener(
  "change",
  async (event) => {
    state.selectedAccountId = event.target.value;
    state.page = 1;

    renderAccounts();

    try {
      await loadTransactions();
    } catch (error) {
      showNotice(error.message, "error");
    }
  }
);

// Create a credit or debit transaction
$("#transaction-form").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const accountId = $("#transaction-account").value;
    const amount = Number($("#transaction-amount").value);
    const referenceId = $("#reference-id").value.trim();

    if (!accountId) {
      showNotice("Please select an account.", "error");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showNotice("Enter an amount greater than zero.", "error");
      $("#transaction-amount").focus();
      return;
    }

    if (!referenceId) {
      showNotice("Please enter a reference ID.", "error");
      $("#reference-id").focus();
      return;
    }

    const body = {
      type: $("#transaction-type").value,
      amount,
      reference_id: referenceId,
      description: $("#description").value.trim() || null,
    };

    const submitButton = event.submitter;

    if (submitButton) submitButton.disabled = true;

    try {
      await api(
        `/accounts/${encodeURIComponent(accountId)}/transactions`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );

      state.selectedAccountId = accountId;
      state.page = 1;

      $("#transaction-amount").value = "";
      $("#reference-id").value = "";
      $("#description").value = "";

      await refresh();

      showNotice("Transaction completed successfully.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }
);

// Transfer money between accounts
$("#transfer-form").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const from = $("#from-account").value;
    const to = $("#to-account").value;
    const amount = Number($("#transfer-amount").value);
    const referenceId = $("#transfer-reference").value.trim();

    if (!from || !to) {
      showNotice(
        "Select both source and destination accounts.",
        "error"
      );
      return;
    }

    if (from === to) {
      showNotice(
        "Choose two different accounts for the transfer.",
        "error"
      );
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showNotice("Enter an amount greater than zero.", "error");
      $("#transfer-amount").focus();
      return;
    }

    if (!referenceId) {
      showNotice(
        "Please enter a transfer reference ID.",
        "error"
      );
      $("#transfer-reference").focus();
      return;
    }

    const submitButton = event.submitter;

    if (submitButton) submitButton.disabled = true;

    try {
      await api("/transfers", {
        method: "POST",
        body: JSON.stringify({
          from_account_id: from,
          to_account_id: to,
          amount,
          reference_id: referenceId,
        }),
      });

      state.selectedAccountId = from;
      state.page = 1;

      $("#transfer-amount").value = "";
      $("#transfer-reference").value = "";

      await refresh();

      showNotice("Transfer completed successfully.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }
);

// Refresh the dashboard
$("#refresh-btn").addEventListener("click", async () => {
  const button = $("#refresh-btn");

  button.disabled = true;

  try {
    await refresh({ keepPage: true });
    showNotice("Dashboard refreshed successfully.");
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

// Change the number of transactions shown per page
$("#history-limit").addEventListener(
  "change",
  async (event) => {
    state.limit = Number(event.target.value);
    state.page = 1;

    try {
      await loadTransactions();
    } catch (error) {
      showNotice(error.message, "error");
    }
  }
);

// Previous page
$("#prev-page").addEventListener("click", async () => {
  if (state.page <= 1) return;

  state.page -= 1;

  try {
    await loadTransactions();
  } catch (error) {
    state.page += 1;
    showNotice(error.message, "error");
  }
});

// Next page
$("#next-page").addEventListener("click", async () => {
  if (state.page >= state.totalPages) return;

  state.page += 1;

  try {
    await loadTransactions();
  } catch (error) {
    state.page -= 1;
    showNotice(error.message, "error");
  }
});

// Initial dashboard load
refresh().catch((error) => {
  $("#accounts-list").innerHTML = `
    <div class="empty-state">
      Unable to load accounts. Check the backend server and database configuration.
    </div>
  `;

  renderEmptyHistory("Transactions could not be loaded.");

  showNotice(error.message, "error");
});
