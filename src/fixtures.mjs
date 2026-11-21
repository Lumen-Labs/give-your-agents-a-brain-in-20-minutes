export function demoFixtures({ firmBrainId, jurisdictionBrainId, jurisdictionId }) {
  const fixtures = [
    {
      sourceKey: "engpolicy1",
      brainId: firmBrainId,
      brainRole: "firm",
      authorityLevel: "firm_policy",
      jurisdictionId: null,
      title: "Engagement replies",
      body: "Firm policy ENG-1. The firm does not send a client a conclusion about a rule until a qualified reviewer approves the text. Status replies may list missing documents only. This is sample text for the desk firm.",
    },
  ];
  if (jurisdictionId === "demolocal") {
    fixtures.push({
      sourceKey: "locrule14aa",
      brainId: jurisdictionBrainId,
      brainRole: "jurisdiction",
      authorityLevel: "regulation",
      jurisdictionId,
      title: "Demonstration rule LOC-14",
      body: "Local demonstration rule LOC-14. A client who asks about a filing deadline must be told that this desk has no licensed statute loaded, and the reviewer must attach the official text before a deadline is stated. This sentence is sample fixture text for jurisdiction demolocal.",
    });
  }
  return fixtures;
}
