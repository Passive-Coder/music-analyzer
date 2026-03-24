import { PageBackground } from "@/app/components/PageBackground";
import { NoteScene } from "@/app/components/NoteScene";
import { WordmarkOverlay } from "@/app/components/WordmarkOverlay";

export default function Home() {
  return (
    <main className="page">
      <PageBackground />
      <NoteScene />
      <WordmarkOverlay />
    </main>
  );
}
