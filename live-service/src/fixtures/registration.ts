/** Review-only transcription of the documented questions. Live form must come from GET /v1/registration/form. */
export const reviewDilemmas = [
  {
    id: "ship_vs_polish",
    question: "Ship at 70% today, or spend another month getting to 90%?",
    options: [
      { id: "ship", label: "Ship now" },
      { id: "polish", label: "Keep refining" },
    ],
  },
  {
    id: "finish_vs_stop",
    question: "Three months in, the project may be going in the wrong direction.",
    options: [
      { id: "finish", label: "Finish first" },
      { id: "stop", label: "Stop now" },
    ],
  },
  {
    id: "hold_vs_explore",
    question: "An interesting opportunity arrives before your current task is finished.",
    options: [
      { id: "hold", label: "Finish the current task" },
      { id: "explore", label: "Try the new opportunity" },
    ],
  },
  {
    id: "self_vs_others",
    question: "You believe you are right, but nobody agrees.",
    options: [
      { id: "self", label: "Follow my judgment" },
      { id: "others", label: "Think it through" },
    ],
  },
];
