import type { ReviewView } from "@/lib/review-view";

/** The review step's problems, printed as one checklist above the table. */
export default function ReviewIssues({ view }: { view: ReviewView }) {
  if (view.items.length === 0) return null;
  return (
    <section className="review-issues" aria-labelledby="review-issues-title">
      <h2 id="review-issues-title" className="label">{view.title}</h2>
      <p className="because">{view.summary}</p>
      <ul className="ladder">
        {view.items.map((i) => (
          <li key={i.key} className={`rung ${i.level === "error" ? "fail" : "warn"}`}>
            <span className="claim">{i.where}</span>
            <span className="mark" aria-hidden="true">{i.level === "error" ? "✗" : "!"}</span>
            <span className="because">{i.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
