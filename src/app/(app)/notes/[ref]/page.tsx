import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { listRelated } from "@/server/engines/relations";
import { getNoteByRef, listCollections } from "@/server/services/notes";
import { getEntityOptions } from "@/server/services/options";
import { Page } from "@/components/ui/layout";
import { Ref } from "@/components/ui/badge";
import { NoteEditor } from "./note-editor";

export async function generateMetadata(props: PageProps<"/notes/[ref]">) {
  return { title: (await props.params).ref };
}

export default async function NotePage(props: PageProps<"/notes/[ref]">) {
  const { ref } = await props.params;
  const sp = await props.searchParams;
  const { actor } = await requireUser();
  const note = await getNoteByRef(actor, ref);
  if (!note) notFound();
  const [related, collections, options] = await Promise.all([listRelated(actor.userId, { type: "note", id: note.id }), listCollections(actor.userId), getEntityOptions(actor)]);
  const mentionUrls = Object.fromEntries(related.filter((r) => r.ref).map((r) => [r.ref!, r.urlPath]));
  return (
    <Page width="narrow">
      <div className="mb-4 flex items-center gap-2 text-xs text-fg-subtle">
        <Link href="/notes" className="hover:text-fg">Notes</Link>
        {note.collection ? (
          <>
            <span>/</span>
            <Link href={`/notes?collection=${encodeURIComponent(note.collection)}`} className="hover:text-fg">{note.collection}</Link>
          </>
        ) : null}
        <span>/</span>
        <Ref>{note.ref}</Ref>
      </div>
      <NoteEditor
        note={{ id: note.id, ref: note.ref, title: note.title, content: note.content, collection: note.collection, pinned: note.pinned, lifeAreaId: note.lifeAreaId, tags: note.tags, archived: !!note.archivedAt, deleted: !!note.deletedAt, updatedAt: note.updatedAt.toISOString() }}
        startEditing={sp.edit === "1"}
        related={related}
        mentionUrls={mentionUrls}
        collections={collections.map((c) => c.name)}
        lifeAreas={options.lifeAreas}
      />
    </Page>
  );
}
