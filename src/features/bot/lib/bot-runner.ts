import type React from "react";
import { clearSession } from "@/lib/session";
import {
  AbortError,
  sleep,
  checkAbort,
  waitFor,
  setReactInput,
  clickRadixSelectByTrigger,
  clickButtonByText,
  clickNavLink,
  pressEnter,
  pick,
  randInt,
  rand,
} from "./dom-helpers";

// ── types ────────────────────────────────────────────────────────────────────

export interface BotConfig {
  totalActions: number;
  /**
   * Drive traffic to /insights. Off by default: the UX-signal scenarios need a
   * page with provably zero views first, so Insights stays untouched until we
   * deliberately want data on it.
   */
  includeInsights: boolean;
}

export interface BotProgress {
  type: "info" | "action" | "success" | "error" | "done";
  message: string;
}

export type LogFn = (p: BotProgress) => void;

interface BotState {
  isLoggedIn: boolean;
  hasWorkspace: boolean;
  users: Array<{ username: string; password: string }>;
  includeInsights: boolean;
}

interface BotAction {
  name: string;
  weight: (state: BotState) => number;
  canRun: (state: BotState) => boolean;
  run: (
    iframe: HTMLIFrameElement,
    state: BotState,
    log: LogFn,
    abortRef: React.MutableRefObject<boolean>
  ) => Promise<void>;
}

// ── data pools ───────────────────────────────────────────────────────────────

const FIRST_NAMES = ["Alex","Jordan","Casey","Morgan","Riley","Taylor","Drew","Quinn","Avery","Blake","Charlie","Dana","Emery","Finley","Harper","Indigo","Jesse","Kai","Lane","Marlowe","Noel","Parker","Reese","Sage","Tatum","Val","Wren","Skyler","Robin","Cameron"];
const LAST_NAMES = ["Smith","Chen","Garcia","Kim","Patel","Johnson","Williams","Brown","Jones","Davis","Miller","Wilson","Moore","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Young","Robinson","Lewis","Walker","Hall","Allen","Wright","Scott","Green"];
const WORKSPACE_NAMES = ["Personal Finance","My Budget","Monthly Expenses","Home Budget","Family Finances","Daily Tracker","Savings Plan","Expense Log","Money Matters","Cash Flow"];
const CURRENCIES = ["US Dollar (USD)","Euro (EUR)","British Pound (GBP)","Indian Rupee (INR)","Japanese Yen (JPY)","Canadian Dollar (CAD)","Australian Dollar (AUD)","Swiss Franc (CHF)","Chinese Yuan (CNY)"];
const LOCALES = ["English (US)","English (UK)","English (India)","German (Germany)","French (France)","Japanese (Japan)","Chinese (China)"];
const TX_DESCRIPTIONS = ["Coffee","Grocery run","Rent","Gas station","Restaurant","Online order","Gym","Pharmacy","Salary","Freelance payment","Utility bill","Movie tickets","Bus pass","Book store","Lunch","Haircut","Subscription","Donation","Clothes shopping","Doctor visit"];
const DISPLAY_NAMES_EXTRA = ["Sam Rivers","Lou Grant","Pat Kelly","Chris Vega","Jamie Stone","Devon Lee","Skyler Fox","Rowan Hunt","Blair West","Quinn Nash"];
const GOAL_NAMES = ["Vacation fund","Emergency fund","New laptop","Wedding fund","Car down payment","Home renovation","Holiday gifts","Retirement boost","Moving fund","New bike"];
const CATEGORY_NAMES = ["Pets","Travel","Education","Gifts","Kids","Subscriptions","Home Improvement","Charity","Insurance","Childcare"];
const QUICK_ADD_PHRASES = ["coffee","groceries","gas","lunch","gym","haircut","movie tickets","pharmacy","bus pass","book store"];

// ── helpers ──────────────────────────────────────────────────────────────────

function weightedPick<T extends { weight: (s: BotState) => number }>(
  items: T[],
  state: BotState
): T {
  const weights = items.map((i) => i.weight(state));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function iframeDoc(iframe: HTMLIFrameElement): Document {
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("iframe document not accessible");
  return doc;
}

function iframeWin(iframe: HTMLIFrameElement): Window {
  const win = iframe.contentWindow;
  if (!win) throw new Error("iframe window not accessible");
  return win;
}

function currentPath(iframe: HTMLIFrameElement): string {
  return iframeWin(iframe).location.pathname;
}

async function navigateTo(
  iframe: HTMLIFrameElement,
  href: string,
  landmarkSelector: string,
  abortRef: React.MutableRefObject<boolean>
): Promise<void> {
  const path = currentPath(iframe);
  if (path !== href) {
    // prefer real link click for analytics
    const clicked = clickNavLink(href, iframeDoc(iframe));
    if (!clicked) {
      // fallback: programmatic navigation
      iframeWin(iframe).history.pushState({}, "", href);
      iframeWin(iframe).dispatchEvent(new (iframeWin(iframe) as Window & { PopStateEvent: typeof PopStateEvent }).PopStateEvent("popstate", {}));
    }
    checkAbort(abortRef);
    await waitFor(landmarkSelector, iframeDoc(iframe), 6000);
  }
}

function randomDate(): string {
  const now = new Date();
  const past = new Date(now.getFullYear(), now.getMonth() - randInt(0, 5), randInt(1, 28));
  return past.toISOString().split("T")[0];
}

// ── action pool ───────────────────────────────────────────────────────────────

const ACTIONS: BotAction[] = [
  // ── signUp ──────────────────────────────────────────────────────────────
  {
    name: "signUp",
    weight: () => 12,
    // Only when logged out — the guest guard bounces a signed-in visitor away from
    // /sign-up, so running this while logged in just burns an action on a timeout.
    canRun: (s) => !s.isLoggedIn,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Sign up new user" });
      const win = iframeWin(iframe);
      const doc = iframeDoc(iframe);

      // navigate to sign-up
      const clicked = clickNavLink("/sign-up", doc) || clickButtonByText("Create account", doc);
      if (!clicked) {
        win.history.pushState({}, "", "/sign-up");
        win.dispatchEvent(new (win as Window & { PopStateEvent: typeof PopStateEvent }).PopStateEvent("popstate", {}));
      }
      checkAbort(abortRef);

      await waitFor("#displayName", doc, 6000);

      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      const displayName = `${firstName} ${lastName}`;
      const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${randInt(10, 999)}`;
      const password = "BotPass@1";

      const displayNameEl = doc.querySelector("#displayName") as HTMLInputElement;
      const usernameEl = doc.querySelector("#username") as HTMLInputElement;
      const passwordEl = doc.querySelector("#password") as HTMLInputElement;
      const confirmEl = doc.querySelector("#confirmPassword") as HTMLInputElement;

      if (!displayNameEl || !usernameEl || !passwordEl || !confirmEl) throw new Error("Sign-up form fields not found");

      setReactInput(displayNameEl, displayName, win);
      await sleep(150, abortRef);
      setReactInput(usernameEl, username, win);
      await sleep(150, abortRef);
      setReactInput(passwordEl, password, win);
      await sleep(150, abortRef);
      setReactInput(confirmEl, password, win);
      await sleep(200, abortRef);

      clickButtonByText("Create account", doc);

      // wait for redirect to workspace setup or dashboard
      await waitFor("#workspace-name, [href='/transactions']", doc, 8000);

      state.users.push({ username, password });
      state.isLoggedIn = true;
      state.hasWorkspace = false;

      log({ type: "success", message: `✓ Signed up as ${username}` });
    },
  },

  // ── signIn ───────────────────────────────────────────────────────────────
  {
    name: "signIn",
    weight: () => 8,
    canRun: (s) => !s.isLoggedIn && s.users.length > 0,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Sign in" });
      const win = iframeWin(iframe);
      const doc = iframeDoc(iframe);

      win.history.pushState({}, "", "/sign-in");
      win.dispatchEvent(new (win as Window & { PopStateEvent: typeof PopStateEvent }).PopStateEvent("popstate", {}));
      checkAbort(abortRef);

      await waitFor("#username", doc, 6000);

      const user = pick(state.users);
      const usernameEl = doc.querySelector("#username") as HTMLInputElement;
      const passwordEl = doc.querySelector("#password") as HTMLInputElement;
      if (!usernameEl || !passwordEl) throw new Error("Sign-in fields not found");

      setReactInput(usernameEl, user.username, win);
      await sleep(150, abortRef);
      setReactInput(passwordEl, user.password, win);
      await sleep(200, abortRef);

      clickButtonByText("Sign in", doc);
      await waitFor("[href='/transactions'], #workspace-name", doc, 8000);

      state.isLoggedIn = true;
      // check if workspace exists
      state.hasWorkspace = currentPath(iframe) !== "/setup-workspace";

      log({ type: "success", message: `✓ Signed in as ${user.username}` });
    },
  },

  // ── setupWorkspace ────────────────────────────────────────────────────────
  {
    name: "setupWorkspace",
    weight: () => 20,
    canRun: (s) => s.isLoggedIn && !s.hasWorkspace,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Setup workspace" });
      const win = iframeWin(iframe);
      const doc = iframeDoc(iframe);

      await waitFor("#workspace-name", doc, 6000);

      const nameEl = doc.querySelector("#workspace-name") as HTMLInputElement;
      if (!nameEl) throw new Error("Workspace name field not found");

      setReactInput(nameEl, pick(WORKSPACE_NAMES), win);
      await sleep(200, abortRef);

      // currency select
      const currencyTrigger = doc.querySelector("#currency") as HTMLElement | null;
      if (currencyTrigger) {
        await clickRadixSelectByTrigger(currencyTrigger, pick(CURRENCIES), doc);
        await sleep(300, abortRef);
      }

      // locale select
      const localeTrigger = doc.querySelector("#locale") as HTMLElement | null;
      if (localeTrigger) {
        await clickRadixSelectByTrigger(localeTrigger, pick(LOCALES), doc);
        await sleep(300, abortRef);
      }

      clickButtonByText("Create Workspace", doc);
      await waitFor("[href='/transactions']", doc, 8000);

      state.hasWorkspace = true;
      log({ type: "success", message: "✓ Workspace created" });
    },
  },

  // ── navigateDashboard ─────────────────────────────────────────────────────
  {
    name: "navigateDashboard",
    weight: () => 5,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Navigate to Dashboard" });
      await navigateTo(iframe, "/", "h1", abortRef);
      await sleep(randInt(400, 800), abortRef);
      log({ type: "success", message: "✓ Viewing Dashboard" });
    },
  },

  // ── navigateTransactions ──────────────────────────────────────────────────
  {
    name: "navigateTransactions",
    weight: () => 5,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Navigate to Transactions" });
      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(randInt(400, 800), abortRef);
      log({ type: "success", message: "✓ Viewing Transactions" });
    },
  },

  // ── navigateInsights ──────────────────────────────────────────────────────
  {
    name: "navigateInsights",
    weight: () => 8,
    // Opt-in only. Everything else keeps /insights at zero views so it can serve as
    // the "no data yet" baseline.
    canRun: (s) => s.isLoggedIn && s.hasWorkspace && s.includeInsights,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Navigate to Insights" });
      await navigateTo(iframe, "/insights", "h1", abortRef);
      // Land and leave without engaging — that's the behaviour we want on record.
      await sleep(randInt(500, 1100), abortRef);
      log({ type: "success", message: "✓ Viewing Insights" });
    },
  },

  // ── navigateSettings ──────────────────────────────────────────────────────
  {
    name: "navigateSettings",
    weight: () => 4,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Navigate to Settings" });
      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(randInt(400, 800), abortRef);
      log({ type: "success", message: "✓ Viewing Settings" });
    },
  },

  // ── addTransaction ────────────────────────────────────────────────────────
  {
    name: "addTransaction",
    weight: () => 12,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Add transaction" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      // click Add Transaction button
      clickButtonByText("Add Transaction", doc);
      await waitFor("#description", doc, 5000);
      await sleep(200, abortRef);

      // pick type tab randomly
      const type = Math.random() > 0.4 ? "Expense" : "Income";
      const tabs = doc.querySelectorAll('button[role="tab"]');
      for (const tab of tabs) {
        if (tab.textContent?.trim() === type) {
          (tab as HTMLElement).click();
          break;
        }
      }
      await sleep(200, abortRef);

      // description
      const descEl = doc.querySelector("#description") as HTMLInputElement | null;
      if (descEl) {
        setReactInput(descEl, pick(TX_DESCRIPTIONS), win);
        await sleep(150, abortRef);
      }

      // amount
      const amountEl = doc.querySelector("#amount") as HTMLInputElement | null;
      if (amountEl) {
        const amount = Math.round(rand(5, 500) * 100) / 100;
        setReactInput(amountEl, String(amount), win);
        await sleep(150, abortRef);
      }

      // date
      const dateEl = doc.querySelector("#date") as HTMLInputElement | null;
      if (dateEl) {
        setReactInput(dateEl, randomDate(), win);
        await sleep(150, abortRef);
      }

      // category — open the select and pick a visible item
      const categoryTrigger = doc.querySelector("#category") as HTMLElement | null;
      if (categoryTrigger) {
        categoryTrigger.click();
        await sleep(400, abortRef);
        // grab all visible dropdown items and pick one randomly
        const items = Array.from(doc.querySelectorAll("[data-radix-select-item], [role='option']")) as HTMLElement[];
        if (items.length > 0) {
          pick(items).click();
          await sleep(200, abortRef);
        } else {
          // close without picking
          doc.body.click();
        }
      }

      await sleep(200, abortRef);

      // submit
      const submitted = clickButtonByText("Add transaction", doc);
      if (!submitted) clickButtonByText("Save", doc);

      await sleep(800, abortRef);
      log({ type: "success", message: `✓ Added ${type.toLowerCase()} transaction` });
    },
  },

  // ── editTransaction ───────────────────────────────────────────────────────
  {
    name: "editTransaction",
    weight: () => 6,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Edit transaction" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      // find action menu buttons (MoreHorizontal)
      const menuBtns = doc.querySelectorAll("table button[aria-haspopup], table button");
      const actionBtns = Array.from(menuBtns).filter(
        (b) => b.querySelector("svg") && b.textContent?.trim() === ""
      ) as HTMLElement[];

      if (actionBtns.length === 0) {
        log({ type: "info", message: "  No transactions to edit yet" });
        return;
      }

      pick(actionBtns).click();
      await sleep(300, abortRef);

      // click Edit in the dropdown
      const clicked = clickButtonByText("Edit", doc);
      if (!clicked) {
        doc.body.click();
        return;
      }

      await waitFor("#description", doc, 4000);
      await sleep(200, abortRef);

      // change description
      const descEl = doc.querySelector("#description") as HTMLInputElement | null;
      if (descEl) {
        setReactInput(descEl, pick(TX_DESCRIPTIONS) + " (edited)", win);
        await sleep(150, abortRef);
      }

      clickButtonByText("Save changes", doc);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Edited transaction" });
    },
  },

  // ── deleteTransaction ─────────────────────────────────────────────────────
  {
    name: "deleteTransaction",
    weight: () => 4,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Delete transaction" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      const menuBtns = Array.from(
        doc.querySelectorAll("table button")
      ).filter((b) => b.querySelector("svg") && b.textContent?.trim() === "") as HTMLElement[];

      if (menuBtns.length === 0) {
        log({ type: "info", message: "  No transactions to delete yet" });
        return;
      }

      pick(menuBtns).click();
      await sleep(300, abortRef);

      const clicked = clickButtonByText("Delete", doc);
      if (!clicked) {
        doc.body.click();
        return;
      }

      // confirm dialog
      await sleep(400, abortRef);
      // AlertDialogAction has "Delete" text
      const allBtns = Array.from(doc.querySelectorAll("button")) as HTMLButtonElement[];
      const confirmBtn = allBtns.find(
        (b) => b.textContent?.trim() === "Delete" && !b.disabled
      );
      if (confirmBtn) confirmBtn.click();

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Deleted transaction" });
    },
  },

  // ── filterTransactions ────────────────────────────────────────────────────
  {
    name: "filterTransactions",
    weight: () => 7,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Filter transactions" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      const searchEl = doc.querySelector('input[placeholder="Search transactions..."]') as HTMLInputElement | null;
      if (searchEl) {
        const term = pick(TX_DESCRIPTIONS).split(" ")[0];
        setReactInput(searchEl, term, win);
        await sleep(600, abortRef);
        log({ type: "success", message: `✓ Searched for "${term}"` });
      }
    },
  },

  // ── clearFilters ──────────────────────────────────────────────────────────
  {
    name: "clearFilters",
    weight: () => 3,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Clear filters" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/transactions", "h1", abortRef);
      await sleep(300, abortRef);

      const clearBtn = doc.querySelector('button[aria-label="Clear filters"]') as HTMLElement | null;
      if (clearBtn) {
        clearBtn.click();
        await sleep(300, abortRef);
        log({ type: "success", message: "✓ Cleared filters" });
      } else {
        log({ type: "info", message: "  No filters to clear" });
      }
    },
  },

  // ── updateProfile ─────────────────────────────────────────────────────────
  {
    name: "updateProfile",
    weight: () => 3,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Update profile" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const displayNameEl = doc.querySelector("#displayName") as HTMLInputElement | null;
      if (!displayNameEl) return;

      setReactInput(displayNameEl, pick(DISPLAY_NAMES_EXTRA), win);
      await sleep(200, abortRef);

      clickButtonByText("Save changes", doc);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Profile updated" });
    },
  },

  // ── updateWorkspace ───────────────────────────────────────────────────────
  {
    name: "updateWorkspace",
    weight: () => 3,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Update workspace settings" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const wsNameEl = doc.querySelector("#workspace-name") as HTMLInputElement | null;
      if (!wsNameEl) return;

      setReactInput(wsNameEl, pick(WORKSPACE_NAMES), win);
      await sleep(200, abortRef);

      // find all "Save changes" buttons — second one belongs to workspace form
      const saveBtns = Array.from(doc.querySelectorAll("button")).filter(
        (b) => b.textContent?.trim() === "Save changes" && !(b as HTMLButtonElement).disabled
      ) as HTMLButtonElement[];
      if (saveBtns.length >= 2) saveBtns[1].click();
      else if (saveBtns.length === 1) saveBtns[0].click();

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Workspace settings updated" });
    },
  },

  // ── addGoal ───────────────────────────────────────────────────────────────
  {
    name: "addGoal",
    // Deliberately lopsided against contributeToGoal: we want a create-then-abandon
    // funnel in the analytics, not balanced goal usage.
    weight: () => 16,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Add goal" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/goals", "h1", abortRef);
      await sleep(300, abortRef);

      clickButtonByText("New Goal", doc);
      await waitFor("#goal-name", doc, 5000);
      await sleep(200, abortRef);

      const nameEl = doc.querySelector("#goal-name") as HTMLInputElement;
      const targetEl = doc.querySelector("#goal-target") as HTMLInputElement;
      setReactInput(nameEl, pick(GOAL_NAMES), win);
      await sleep(150, abortRef);
      setReactInput(targetEl, String(randInt(500, 10000)), win);
      await sleep(150, abortRef);

      clickButtonByText("Create goal", doc);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Goal created" });
    },
  },

  // ── contributeToGoal ──────────────────────────────────────────────────────
  {
    name: "contributeToGoal",
    weight: () => 2,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Contribute to goal" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/goals", "h1", abortRef);
      await sleep(300, abortRef);

      const addMoneyBtns = Array.from(doc.querySelectorAll("button")).filter(
        (b) => b.textContent?.trim() === "Add money"
      ) as HTMLButtonElement[];
      if (addMoneyBtns.length === 0) {
        log({ type: "info", message: "  No goals to contribute to yet" });
        return;
      }
      pick(addMoneyBtns).click();

      await waitFor("#contribution-amount", doc, 5000);
      await sleep(200, abortRef);

      const amountEl = doc.querySelector("#contribution-amount") as HTMLInputElement;
      setReactInput(amountEl, String(randInt(20, 500)), win);
      await sleep(150, abortRef);

      clickButtonByText("Add contribution", doc);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Contribution added" });
    },
  },

  // ── deleteGoal ────────────────────────────────────────────────────────────
  {
    // Kept rare: deleting goals would thin out the unfunded-goal population we're
    // trying to build up.
    name: "deleteGoal",
    weight: () => 1,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Delete goal" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/goals", "h1", abortRef);
      await sleep(300, abortRef);

      const deleteBtns = Array.from(doc.querySelectorAll("button")).filter(
        (b) => b.textContent?.trim() === "Delete goal"
      ) as HTMLButtonElement[];
      if (deleteBtns.length === 0) {
        log({ type: "info", message: "  No goals to delete yet" });
        return;
      }
      pick(deleteBtns).click();
      await sleep(400, abortRef);

      const dialog = doc.querySelector('[data-slot="alert-dialog-content"]');
      const confirmBtn = dialog
        ? (Array.from(dialog.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Delete"
          ) as HTMLButtonElement | undefined)
        : undefined;
      if (confirmBtn) confirmBtn.click();

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Goal deleted" });
    },
  },

  // ── addCategory ───────────────────────────────────────────────────────────
  {
    name: "addCategory",
    weight: () => 5,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Add category" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(300, abortRef);

      clickButtonByText("Add Category", doc);
      await waitFor("#cat-name", doc, 5000);
      await sleep(200, abortRef);

      const nameEl = doc.querySelector("#cat-name") as HTMLInputElement;
      setReactInput(nameEl, pick(CATEGORY_NAMES), win);
      await sleep(150, abortRef);

      clickButtonByText("Add category", doc);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Category added" });
    },
  },

  // ── deleteCategory ────────────────────────────────────────────────────────
  {
    name: "deleteCategory",
    weight: () => 2,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Delete category" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(300, abortRef);

      const deleteBtns = Array.from(doc.querySelectorAll("button")).filter(
        (b) => b.textContent?.trim() === "Delete" && !(b as HTMLButtonElement).disabled
      ) as HTMLButtonElement[];
      if (deleteBtns.length === 0) {
        log({ type: "info", message: "  No custom categories to delete" });
        return;
      }
      pick(deleteBtns).click();
      await sleep(400, abortRef);

      const dialog = doc.querySelector('[data-slot="alert-dialog-content"]');
      const confirmBtn = dialog
        ? (Array.from(dialog.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Delete"
          ) as HTMLButtonElement | undefined)
        : undefined;
      if (confirmBtn) confirmBtn.click();

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Category deleted" });
    },
  },

  // ── setBudget ─────────────────────────────────────────────────────────────
  {
    name: "setBudget",
    weight: () => 6,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Set budget" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const inputs = Array.from(
        doc.querySelectorAll('input[aria-label^="Monthly budget for "]')
      ) as HTMLInputElement[];
      if (inputs.length === 0) {
        log({ type: "info", message: "  No budget rows found" });
        return;
      }
      const input = pick(inputs);
      setReactInput(input, String(randInt(50, 800)), win);
      await sleep(200, abortRef);

      const row = input.closest("div.flex.items-center.justify-between");
      const setBtn = row
        ? (Array.from(row.querySelectorAll("button")).find(
            (b) => b.textContent?.trim() === "Set" && !(b as HTMLButtonElement).disabled
          ) as HTMLButtonElement | undefined)
        : undefined;
      if (setBtn) setBtn.click();

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Budget set" });
    },
  },

  // ── clearBudget ───────────────────────────────────────────────────────────
  {
    name: "clearBudget",
    weight: () => 2,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Clear budget" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const clearBtns = Array.from(
        doc.querySelectorAll('button[aria-label^="Clear budget for "]')
      ) as HTMLElement[];
      if (clearBtns.length === 0) {
        log({ type: "info", message: "  No budgets to clear" });
        return;
      }
      pick(clearBtns).click();
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Budget cleared" });
    },
  },

  // ── exportData ────────────────────────────────────────────────────────────
  {
    // Low: each run downloads a real file to disk, and export/import aren't part of
    // the scenarios we're seeding for.
    name: "exportData",
    weight: () => 1,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Export data" });
      const doc = iframeDoc(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const exportFormat = Math.random() > 0.5 ? "JSON" : "CSV";
      clickButtonByText(`Export ${exportFormat}`, doc);

      await sleep(500, abortRef);
      log({ type: "success", message: `✓ Exported ${exportFormat}` });
    },
  },

  // ── importData ────────────────────────────────────────────────────────────
  {
    name: "importData",
    weight: () => 1,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Import data" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      await navigateTo(iframe, "/settings", "h1", abortRef);
      await sleep(400, abortRef);

      const input = doc.querySelector("#import-file") as HTMLInputElement | null;
      if (!input) return;

      const FileCtor = (win as Window & { File: typeof File }).File;
      const DataTransferCtor = (win as Window & { DataTransfer: typeof DataTransfer }).DataTransfer;
      const EventCtor = (win as Window & { Event: typeof Event }).Event;
      const file = new FileCtor([JSON.stringify({ transactions: [] })], "bot-import.json", {
        type: "application/json",
      });
      const dt = new DataTransferCtor();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new EventCtor("change", { bubbles: true }));

      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Data imported" });
    },
  },

  // ── quickAddTransaction ───────────────────────────────────────────────────
  {
    name: "quickAddTransaction",
    // High and consistently successful — this is the "healthy feature" baseline.
    weight: () => 16,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, _state, log, abortRef) {
      log({ type: "action", message: "→ Quick add transaction" });
      const doc = iframeDoc(iframe);
      const win = iframeWin(iframe);

      const trigger = doc.querySelector('[aria-label="Open quick add"]') as HTMLElement | null;
      if (!trigger) return;
      trigger.click();

      await waitFor('[aria-label="Quick add transaction"]', doc, 4000);
      await sleep(200, abortRef);

      const input = doc.querySelector('[aria-label="Quick add transaction"]') as HTMLInputElement;
      const amount = Math.round(rand(5, 300) * 100) / 100;
      setReactInput(input, `${pick(QUICK_ADD_PHRASES)} ${amount}`, win);
      await sleep(400, abortRef);

      // pick a category chip if offered, to guarantee a category is set
      const dialog = doc.querySelector('[data-slot="dialog-content"]');
      const chipBtns = dialog ? (Array.from(dialog.querySelectorAll("button")) as HTMLElement[]) : [];
      if (chipBtns.length > 0) {
        pick(chipBtns).click();
        await sleep(200, abortRef);
      }

      pressEnter(input, win);
      await sleep(600, abortRef);
      log({ type: "success", message: "✓ Quick-added transaction" });
    },
  },

  // ── signOut ───────────────────────────────────────────────────────────────
  {
    name: "signOut",
    // Raised so one long run cycles through many visitors instead of one.
    weight: () => 5,
    canRun: (s) => s.isLoggedIn && s.hasWorkspace,
    async run(iframe, state, log, abortRef) {
      log({ type: "action", message: "→ Sign out" });
      const doc = iframeDoc(iframe);

      const signOutBtn = doc.querySelector('button[aria-label="Sign out"]') as HTMLElement | null;
      if (signOutBtn) {
        signOutBtn.click();
        await sleep(800, abortRef);
        state.isLoggedIn = false;
        state.hasWorkspace = false;
        log({ type: "success", message: "✓ Signed out" });
      }
    },
  },
];

// ── main entry point ──────────────────────────────────────────────────────────

export async function runBot(
  iframe: HTMLIFrameElement,
  config: BotConfig,
  log: LogFn,
  abortRef: React.MutableRefObject<boolean>
): Promise<void> {
  const state: BotState = {
    isLoggedIn: false,
    hasWorkspace: false,
    users: [],
    includeInsights: config.includeInsights,
  };

  // The iframe is same-origin, so this is the same localStorage a previous
  // run's session would still be sitting in — clear it or the first signUp
  // gets redirected away from /sign-up by the guest guard.
  clearSession();

  // reset iframe to start
  iframe.src = "/";
  await new Promise<void>((resolve) => {
    const onLoad = () => { iframe.removeEventListener("load", onLoad); resolve(); };
    iframe.addEventListener("load", onLoad);
    setTimeout(resolve, 3000);
  });

  log({ type: "info", message: `Starting bot — ${config.totalActions} actions` });

  for (let i = 0; i < config.totalActions; i++) {
    checkAbort(abortRef);

    // if we just signed up, workspace setup is mandatory next
    const forcedSetup = state.isLoggedIn && !state.hasWorkspace;
    const available = ACTIONS.filter((a) => {
      if (!a.canRun(state)) return false;
      if (forcedSetup && a.name !== "setupWorkspace") return false;
      return true;
    });

    if (available.length === 0) break;

    const action = weightedPick(available, state);

    try {
      await action.run(iframe, state, log, abortRef);
    } catch (err) {
      if (err instanceof AbortError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      log({ type: "error", message: `✗ ${action.name} failed: ${msg}` });
    }

    checkAbort(abortRef);
    await sleep(randInt(400, 900), abortRef);
  }

  log({ type: "done", message: `★ Bot finished — ${config.totalActions} actions, ${state.users.length} user(s) created` });
}
