// Meldet Lenas Implementierungen bei der neutralen Bruecke (shared/lenaBridge)
// an. Wird beim Server-Boot per GUARDED dynamic import geladen (siehe
// server.js). Ein Fehler hier deaktiviert nur Lena — Clara/der Server bleiben
// unberuehrt. Dies ist die EINZIGE Stelle, an der Lena aktiv „eingehaengt“ wird.

import { registerVisitBriefingProvider, registerDictationProvider } from "../shared/lenaBridge.js";
import { loadWeightedVisitBriefing } from "./lenaBriefing.js";
import {
  readTreatmentDictation,
  findInTreatment,
  readTreatmentLabels,
  addTreatmentLabel,
  findBackdatedAppointment,
} from "./lenaDictation.js";

registerVisitBriefingProvider(loadWeightedVisitBriefing);
registerDictationProvider({
  readTreatmentDictation,
  findInTreatment,
  readTreatmentLabels,
  addTreatmentLabel,
  findBackdatedAppointment,
});
