import { describeProfileRevision } from "@/lib/profile/revision-diff";
import type {
  MasterProfileInput,
  MasterProfileUpdateInput,
} from "@/lib/validations/profile";

type NamedProfile = MasterProfileInput | MasterProfileUpdateInput;

/**
 * Short title for a save. The itemized diff is stored beside this title.
 * `at` remains on the signature; the clock is shown by the history row.
 */
export async function nameProfileRevision(
  previous: NamedProfile | null,
  next: NamedProfile,
  _at: Date = new Date()
): Promise<string> {
  return describeProfileRevision(previous, next).title;
}
