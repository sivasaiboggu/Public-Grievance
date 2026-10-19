# Project understanding

GrievanceGrid is a civic-complaint prototype for four visible problems: road damage, garbage dumping, waterlogging, and missing or broken manhole covers. It serves citizens, field officers, coordinating officers, supervisors, appellate officers, senior authorities, and technical administrators. Citizens submit and track individual complaints. Officers confirm issues, explain priority, route work, review outcomes, respond, and decide appeals. Field officers update assigned work, including evidence that may need to sync later.

The product has two separate applications: Expo/React Native for citizen and field workflows, and Next.js for responsive citizen and officer workflows. Pure contracts and tokens may be shared, but UI code may not. FastAPI remains the authority for authentication and authorisation. Until it is reachable, development data must be clearly labelled demo data.

The project must never claim that AI has verified a report, detected fraud, established urgency, or made an outcome. A model may provide a visible, versioned suggestion with an honest availability state; an officer confirms every consequential decision. Reports and confirmed incidents have different meanings and every map or count must say which it uses. Incident links require an officer rationale and can be reversed. Deadlines come from configuration. Completing work never auto-closes a citizen complaint.

The initial usable outcome is a manual complaint lifecycle: a citizen submits an in-scope issue with text, location, and optional evidence; receives a tracking ID; and sees an authorised officer review and update it. Later phases add field work, responses, appeals, transparent analysis assistance, and clearly scoped mapping.
