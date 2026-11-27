// Same result as ScoresService.calculateAnsSelectionResult, worked out from the
// sub-session's sessions that getSetResult has already loaded (see
// ScoresService.getSubSessionSummary). The old method ran a findOne that loaded
// the learner's whole `scores` document (every session ever, up to several MB)
// just to read one session's answer list.
//
// `sessions` is already limited to the sub-session and language, so the only
// remaining condition is the session id.
export const ansSelectionFromSessions = (
  sessions: any[],
  sessionId: string,
): { result: boolean; percentage: number } | null => {
  const session = sessions.find(
    (s) => s.session_id === sessionId && s.ansSelectionStatus,
  );
  if (!session || !session.ansSelectionStatus) return null;

  let correctCount = 0;
  let totalCount = 0;

  // Array format: [{ text: "a", status: true, gameType: "..." }, ...]
  if (Array.isArray(session.ansSelectionStatus)) {
    totalCount = session.ansSelectionStatus.length;
    correctCount = session.ansSelectionStatus.filter(
      (item) => item && typeof item === 'object' && item.status === true,
    ).length;
  }
  // Old object format: { "a": true, "b": false, ... }
  else if (typeof session.ansSelectionStatus === 'object') {
    const values = Object.values(session.ansSelectionStatus);
    totalCount = values.length;
    correctCount = values.filter(Boolean).length;
  } else {
    return null;
  }

  const percentage =
    totalCount > 0 ? Math.floor((correctCount / totalCount) * 100) : 0;
  const result = totalCount > 0 ? percentage >= 80 : false;
  return { result, percentage };
};
