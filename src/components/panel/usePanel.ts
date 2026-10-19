import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { withDiversityChoices } from '@/autofill/diversity';
import { fillFields, replaceText } from '@/autofill/fill';
import {
  attentionQueue,
  planFill,
  summarise,
  type FieldReport,
  type ReportSummary,
} from '@/autofill/report';
import {
  chooseSuggestedOption,
  confirmAnswer,
  confirmChoice,
  confirmDraft,
  confirmReplace,
  previewChoice,
  type ChoiceCheck,
  type ChoicePreview,
  type SectionChoice,
} from '@/autofill/resolve';
import type { AutofillValues } from '@/autofill/fields';
import type { OpenQuestion } from '@/autofill/open-question';
import {
  scanFields,
  type FieldElement,
  type ScannedField,
} from '@/autofill/scan';
import type {
  AutofillValuesResponse,
  PanelSettings,
  ProfileSection,
} from '@/messages';
import { goToField, type GoToResult } from '@/page/navigate';
import { readPageContext, type PageContext } from '@/page/page-context';
import {
  initialPanelState,
  nextInQueue,
  panelReducer,
  type FieldFilter,
  type PanelState,
} from './panel-state';
import {
  CONTEXT_LOST,
  isExtensionContextValid,
  openProfile,
  requestAiDraft,
  requestAutofillValues,
  requestDiversityChoices,
  requestDraftPreview,
  requestPanelSettings,
} from './profile-access';
import { plural } from './vocabulary';

/** Reads the confirmed profile's values; injectable for tests. */
export type LoadValues = () => Promise<AutofillValuesResponse>;

/** What happened when the user confirmed a chosen record. */
export type ChoiceResult =
  { ok: true; filled: number; total: number } | { ok: false; message: string };

export interface PanelModel extends PanelState {
  page: PageContext;
  /** One report per field, in page order. */
  reports: FieldReport[];
  summary: ReportSummary;
  /** Fields the user must complete, most urgent first. */
  queue: FieldReport[];
  /** Screen-reader text describing the latest outcome. */
  announcement: string;
  autofill: () => void;
  rescan: () => void;
  expand: (filter?: FieldFilter) => void;
  /**
   * Opens the full list with the saved answers the user can use at the
   * top, and focus on the first. Writes nothing.
   */
  reviewAnswers: () => void;
  /** True once after `reviewAnswers`, for the list to move focus. */
  takeAnswerFocus: () => boolean;
  collapse: () => void;
  setFilter: (filter: FieldFilter) => void;
  /** Selects a field, or clears the selection when it is already selected. */
  toggleSelect: (element: FieldElement) => void;
  clearSelection: () => void;
  /** Moves to the next field that needs the user, in priority order. */
  next: () => void;
  /** What choosing a saved record for a section would fill; no page changes. */
  previewChoice: (choice: SectionChoice) => ChoicePreview | null;
  /**
   * Fills a section from the record the user chose, after re-checking that
   * the page and profile still match the preview (`previewed` fields).
   */
  applyChoice: (
    choice: SectionChoice,
    previewed: readonly FieldReport[],
  ) => Promise<ChoiceResult>;
  /** Scrolls to a field of the current scan and focuses it if safe. */
  goToField: (element: FieldElement) => GoToResult;
  /**
   * Fills one question with the saved answer the user chose to use, after
   * re-checking the question and the saved answer (`previewed`).
   */
  applyAnswer: (previewed: FieldReport) => Promise<ChoiceResult>;
  /**
   * Chooses the suggested answer in one custom dropdown the user asked
   * about (ADR 0021), after re-checking it, and reports only what the
   * page verifiably kept. Never submits.
   */
  chooseOption: (previewed: FieldReport) => Promise<ChoiceResult>;
  /** Opens the profile page; a failure is reported in `problem`. */
  openProfile: () => void;
  /** Opens the saved application answers; failures as for the profile. */
  openAnswers: () => void;
  /** Opens the diversity preferences; failures as for the profile. */
  openDiversity: () => void;
  /** Why the last profile action failed, in words the user can act on. */
  problem: string | null;
  /** Show how each field was recognised (Developer diagnostics). */
  diagnostics: boolean;
  /** Whether AI drafting is connected (ADR 0019); off until known. */
  ai: boolean;
  /** What drafting could share for an open question, from the background. */
  previewDraft: Drafting['preview'];
  /** Asks for one draft; aborting the signal cancels it. */
  draftAnswer: Drafting['draft'];
  /**
   * Inserts the user's final text into the open question it was drafted
   * for, after re-checking the field. Never submits.
   */
  insertDraft: (
    previewed: FieldReport,
    text: string,
    drafted: OpenQuestion,
  ) => Promise<ChoiceResult>;
  /**
   * Replaces the applicant's own answer with an improved one they
   * confirmed, only if the field still holds exactly `original`.
   */
  replaceAnswer: (
    previewed: FieldReport,
    text: string,
    drafted: OpenQuestion,
    original: string,
  ) => Promise<ChoiceResult>;
  /** Opens the skills and projects; failures as for the profile. */
  openSkills: () => void;
  /** Opens the AI Assistant settings; failures as for the profile. */
  openAiSettings: () => void;
}

/** The panel's way to the background for AI drafting; replaced in tests. */
export interface Drafting {
  preview: typeof requestDraftPreview;
  draft: typeof requestAiDraft;
}

const browserDrafting: Drafting = {
  preview: requestDraftPreview,
  draft: requestAiDraft,
};

/**
 * The panel's state and actions, shared by the compact and expanded modes.
 *
 * Profile lifecycle: the confirmed profile's values are read when the panel
 * opens, on every explicit rescan, and again immediately before autofill
 * writes anything, so a profile edited in another tab is never filled from
 * a stale copy. Nothing listens for storage changes and nothing is filled
 * automatically when the profile changes.
 *
 * The page is scanned when the panel opens, again right before autofill and
 * on an explicit rescan. Nothing else touches the page.
 */
export function usePanel(
  loadValues: LoadValues = requestAutofillValues,
  root: ParentNode = document,
  openProfileRequest: (
    section?: ProfileSection,
  ) => Promise<boolean> = openProfile,
  loadSettings: () => Promise<PanelSettings> = requestPanelSettings,
  chooseDiversity: typeof requestDiversityChoices = requestDiversityChoices,
  drafting: Drafting = browserDrafting,
): PanelModel {
  // Off until the background says otherwise, and off if it cannot.
  const [diagnostics, setDiagnostics] = useState(false);
  const [ai, setAi] = useState(false);
  /** Why an action failed, shown in the panel; cleared on the next try. */
  const [problem, setProblem] = useState<string | null>(null);
  const [state, dispatch] = useReducer(panelReducer, root, (r) =>
    initialPanelState(scanFields(r)),
  );
  const [page] = useState(readPageContext);
  // The newest read wins, so a slow earlier reply never replaces fresh values.
  const latestRequest = useRef(0);
  const filling = useRef(false);

  const openPage = useCallback(
    (section?: ProfileSection) => {
      setProblem(null);
      void openProfileRequest(section).then((opened) => {
        if (opened) return;
        setProblem(
          isExtensionContextValid()
            ? 'ApplyKit could not open your profile. Try again, or open it from your browser’s extension settings.'
            : CONTEXT_LOST,
        );
      });
    },
    [openProfileRequest],
  );

  const openProfileAction = useCallback(() => {
    openPage();
  }, [openPage]);
  const openAnswersAction = useCallback(() => {
    openPage('answers');
  }, [openPage]);
  const openDiversityAction = useCallback(() => {
    openPage('diversity');
  }, [openPage]);
  const openSkillsAction = useCallback(() => {
    openPage('skills');
  }, [openPage]);
  const openAiAction = useCallback(() => {
    openPage('ai');
  }, [openPage]);

  const refreshValues = useCallback(async () => {
    const request = ++latestRequest.current;
    const values = await loadValues();
    if (request === latestRequest.current) dispatch({ type: 'values', values });
  }, [loadValues]);

  const onOpen = useEffectEvent(() => {
    void refreshValues();
    void loadSettings().then((settings) => {
      setDiagnostics(settings.diagnostics);
      setAi(settings.ai);
    });
  });
  useEffect(() => {
    onOpen();
  }, []);

  const values = state.values.status === 'ready' ? state.values.values : null;
  // Every scan produces a new `fields` array, so plans re-read values the
  // user typed since the last scan.
  const reports = useMemo(
    () =>
      (state.outcomes ?? planFill(state.fields, values)).map(
        (report) => state.confirmed.get(report.field.element) ?? report,
      ),
    [state.fields, state.outcomes, state.confirmed, values],
  );
  const summary = useMemo(() => summarise(reports), [reports]);
  const queue = useMemo(() => attentionQueue(reports), [reports]);

  const listed = useMemo(
    () => new Set<Element>(state.fields.map((field) => field.element)),
    [state.fields],
  );

  const runAutofill = useCallback(async () => {
    if (filling.current) return;
    filling.current = true;
    dispatch({ type: 'fill-started' });
    try {
      // Always the latest saved profile, not the copy read on open.
      const request = ++latestRequest.current;
      const latest = await loadValues();
      if (request === latestRequest.current) {
        dispatch({ type: 'values', values: latest });
      }
      if (latest.status !== 'ready') {
        dispatch({ type: 'fill-stopped', values: latest });
        return;
      }
      const fields = scanFields(root);
      // Monitoring questions get their option from the background now, and
      // only now, if the user turned on reuse (ADR 0018); only those the
      // panel listed before the click.
      const plan = await withDiversityChoices(
        planFill(fields, latest.values),
        chooseDiversity,
        listed,
      );
      const outcomes = await fillFields(plan);
      dispatch({ type: 'autofilled', fields, outcomes });
    } catch {
      // Show the page as it is now rather than a result that is not known.
      dispatch({ type: 'rescanned', fields: scanFields(root) });
    } finally {
      filling.current = false;
    }
  }, [loadValues, root, chooseDiversity, listed]);

  const preview = useCallback(
    (choice: SectionChoice) =>
      values ? previewChoice(state.fields, values, choice) : null,
    [state.fields, values],
  );

  /**
   * Writes what the user confirmed, as for autofill: with the latest saved
   * values and the page as it is now, only if `check` still agrees with
   * what they saw.
   */
  const confirmAndFill = useCallback(
    async (
      check: (fields: ScannedField[], values: AutofillValues) => ChoiceCheck,
      notice: (filled: number) => string,
    ): Promise<ChoiceResult> => {
      if (filling.current) {
        return { ok: false, message: 'ApplyKit is still filling. Try again.' };
      }
      filling.current = true;
      try {
        const request = ++latestRequest.current;
        const latest = await loadValues();
        if (request === latestRequest.current) {
          dispatch({ type: 'values', values: latest });
        }
        if (latest.status !== 'ready') {
          return {
            ok: false,
            message:
              'Your saved profile could not be read. Nothing was filled.',
          };
        }
        const checked = check(scanFields(root), latest.values);
        if (!checked.ok) return checked;
        const outcomes = await fillFields(checked.plan);
        const filled = outcomes.filter(
          (r) =>
            r.chosen && (r.status === 'filled' || r.status === 'reformatted'),
        ).length;
        dispatch({ type: 'resolved', outcomes, notice: notice(filled) });
        return { ok: true, filled, total: outcomes.length };
      } catch {
        return {
          ok: false,
          message: 'Something went wrong. Nothing more was filled.',
        };
      } finally {
        filling.current = false;
      }
    },
    [loadValues, root],
  );

  const applyChoice = useCallback(
    (choice: SectionChoice, previewed: readonly FieldReport[]) =>
      confirmAndFill(
        (fields, values) => confirmChoice(fields, values, choice, previewed),
        (filled) =>
          `Filled ${plural(filled, 'field')} from the record you chose. Nothing was submitted.`,
      ),
    [confirmAndFill],
  );

  const applyAnswer = useCallback(
    (previewed: FieldReport) =>
      confirmAndFill(
        (fields, values) => confirmAnswer(fields, values, previewed),
        (filled) =>
          filled === 1
            ? 'Filled your saved answer. Nothing was submitted.'
            : 'Your saved answer was not accepted by the page. Nothing was submitted.',
      ),
    [confirmAndFill],
  );

  const chooseOption = useCallback(
    async (previewed: FieldReport): Promise<ChoiceResult> => {
      if (filling.current) {
        return { ok: false, message: 'ApplyKit is still filling. Try again.' };
      }
      filling.current = true;
      try {
        const request = ++latestRequest.current;
        const latest = await loadValues();
        if (request === latestRequest.current) {
          dispatch({ type: 'values', values: latest });
        }
        if (latest.status !== 'ready') {
          return {
            ok: false,
            message:
              'Your saved profile could not be read. Nothing was chosen.',
          };
        }
        const result = await chooseSuggestedOption(
          scanFields(root),
          latest.values,
          previewed,
          chooseDiversity,
        );
        if (!result.ok) return result;
        const filled = result.report.status === 'filled' ? 1 : 0;
        dispatch({
          type: 'resolved',
          outcomes: [result.report],
          notice: filled
            ? 'Chose your answer in the dropdown. Other questions may have changed: rescan to check. Nothing was submitted.'
            : 'ApplyKit could not choose in this dropdown. Nothing was submitted.',
        });
        return { ok: true, filled, total: 1 };
      } catch {
        return {
          ok: false,
          message: 'Something went wrong. Nothing more was chosen.',
        };
      } finally {
        filling.current = false;
      }
    },
    [loadValues, root, chooseDiversity],
  );

  const insertDraft = useCallback(
    async (
      previewed: FieldReport,
      text: string,
      drafted: OpenQuestion,
    ): Promise<ChoiceResult> => {
      if (filling.current) {
        return { ok: false, message: 'ApplyKit is still filling. Try again.' };
      }
      filling.current = true;
      try {
        const checked = confirmDraft(
          scanFields(root),
          previewed,
          text,
          drafted,
        );
        if (!checked.ok) return checked;
        const outcomes = await fillFields(checked.plan);
        const filled = outcomes.filter(
          (r) => r.status === 'filled' || r.status === 'reformatted',
        ).length;
        dispatch({
          type: 'resolved',
          outcomes,
          notice:
            filled === 1
              ? 'Inserted your answer. Nothing was submitted.'
              : 'The page did not accept your answer. Nothing was submitted.',
        });
        return { ok: true, filled, total: outcomes.length };
      } catch {
        return {
          ok: false,
          message: 'Something went wrong. Nothing was inserted.',
        };
      } finally {
        filling.current = false;
      }
    },
    [root],
  );

  const replaceAnswer = useCallback(
    async (
      previewed: FieldReport,
      text: string,
      drafted: OpenQuestion,
      original: string,
    ): Promise<ChoiceResult> => {
      if (filling.current) {
        return { ok: false, message: 'ApplyKit is still filling. Try again.' };
      }
      filling.current = true;
      try {
        const checked = confirmReplace(
          scanFields(root),
          previewed,
          text,
          drafted,
          original,
        );
        if (!checked.ok) return checked;
        const answer = text.trim();
        const outcome = await replaceText(checked.element, original, answer);
        if (outcome === 'changed') {
          return {
            ok: false,
            message:
              'Your answer on the page has changed since you asked for an improvement, so ApplyKit left it as it is.',
          };
        }
        const replaced = outcome === 'replaced';
        dispatch({
          type: 'resolved',
          outcomes: [
            {
              ...checked.report,
              status: replaced ? 'filled' : 'rejected',
              value: replaced ? answer : null,
              chosen: true,
              note: replaced ? 'Improved with AI; replaced by you.' : null,
              reason: replaced
                ? null
                : 'The page did not keep the improved answer.',
            },
          ],
          notice: replaced
            ? 'Replaced your answer. Nothing was submitted.'
            : 'The page did not accept the improved answer. Nothing was submitted.',
        });
        return { ok: true, filled: replaced ? 1 : 0, total: 1 };
      } catch {
        return {
          ok: false,
          message: 'Something went wrong. Nothing was replaced.',
        };
      } finally {
        filling.current = false;
      }
    },
    [root],
  );

  const goTo = useCallback(
    (element: FieldElement) =>
      goToField(element, new Set(state.fields.map((field) => field.element))),
    [state.fields],
  );

  const autofill = useCallback(() => {
    void runAutofill();
  }, [runAutofill]);

  const rescan = useCallback(() => {
    if (filling.current) return;
    dispatch({ type: 'rescanned', fields: scanFields(root) });
    void refreshValues();
  }, [root, refreshValues]);

  const expand = useCallback((filter?: FieldFilter) => {
    dispatch(filter ? { type: 'expand', filter } : { type: 'expand' });
  }, []);
  const answerFocus = useRef(false);
  const reviewAnswers = useCallback(() => {
    answerFocus.current = true;
    dispatch({ type: 'expand', filter: 'you' });
  }, []);
  const takeAnswerFocus = useCallback(() => {
    const pending = answerFocus.current;
    answerFocus.current = false;
    return pending;
  }, []);
  const collapse = useCallback(() => {
    dispatch({ type: 'collapse' });
  }, []);
  const setFilter = useCallback((filter: FieldFilter) => {
    dispatch({ type: 'set-filter', filter });
  }, []);
  const clearSelection = useCallback(() => {
    dispatch({ type: 'select', element: null });
  }, []);
  const toggleSelect = useCallback(
    (element: FieldElement) => {
      dispatch({
        type: 'select',
        element: state.selected === element ? null : element,
      });
    },
    [state.selected],
  );
  const next = useCallback(() => {
    const element = nextInQueue(queue, state.selected);
    if (!element) return;
    dispatch({ type: 'select', element });
    // Keep the newly selected field visible in the expanded list.
    if (state.mode === 'expanded' && state.filter === 'handled') {
      dispatch({ type: 'set-filter', filter: 'you' });
    }
  }, [queue, state.selected, state.mode, state.filter]);

  return {
    ...state,
    page,
    reports,
    summary,
    queue,
    announcement:
      state.notice || (state.phase === 'done' ? describeOutcome(summary) : ''),
    autofill,
    rescan,
    expand,
    reviewAnswers,
    takeAnswerFocus,
    collapse,
    setFilter,
    toggleSelect,
    clearSelection,
    next,
    previewChoice: preview,
    applyChoice,
    applyAnswer,
    chooseOption,
    goToField: goTo,
    diagnostics,
    openProfile: openProfileAction,
    openAnswers: openAnswersAction,
    openDiversity: openDiversityAction,
    openSkills: openSkillsAction,
    openAiSettings: openAiAction,
    ai,
    previewDraft: drafting.preview,
    draftAnswer: drafting.draft,
    insertDraft,
    replaceAnswer,
    // An old panel left on the page after ApplyKit was reloaded can no
    // longer reach it; "Try again" cannot help, so say what will.
    problem:
      problem ??
      (state.values.status === 'error' && !isExtensionContextValid()
        ? CONTEXT_LOST
        : null),
  };
}

function describeOutcome(summary: ReportSummary): string {
  const parts = [
    `Autofill finished. Filled ${plural(summary.filled, 'field')}`,
  ];
  if (summary.kept) {
    parts.push(
      `kept ${plural(summary.kept, 'existing entry', 'existing entries')}`,
    );
  }
  if (summary.failed) {
    parts.push(`${plural(summary.failed, 'field')} not accepted`);
  }
  parts.push(`${plural(summary.needsYou, 'field')} need you`);
  return `${parts.join(', ')}. Nothing was submitted.`;
}
