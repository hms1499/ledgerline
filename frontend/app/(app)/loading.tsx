import Tape from "@/components/ui/Tape";

/**
 * The brief pause while a route's server work streams in. The shell around it
 * is already on screen, so this is one block of paper, still feeding
 * (tape spec §6.1).
 */
export default function Loading() {
  return (
    <Tape state="feeding">
      <p className="label">Checking the tape</p>
    </Tape>
  );
}