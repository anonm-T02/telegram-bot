import { useEffect, useRef, useState } from "react";
import type { FaqArticle, SessionApiClient, SupportTicket } from "./apiClient.js";
import { getPublicFaq } from "./apiClient.js";

const key = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

export function SupportScreen({ client }: { client?: SessionApiClient }): JSX.Element {
  const [faq, setFaq] = useState<FaqArticle[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const conversation = useRef<string>();
  const lastQuestion = useRef("");

  useEffect(() => {
    const ticketRequest = client ? client.getSupportTickets() : Promise.resolve({ tickets: [] });
    void Promise.all([getPublicFaq(), ticketRequest]).then(([faqResult, ticketResult]) => {
      setFaq(faqResult.articles);
      setTickets(ticketResult.tickets);
    });
  }, [client]);

  async function ask() {
    if (!client || question.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      lastQuestion.current = question.trim();
      const result = await client.supportChat(
        lastQuestion.current,
        key("chat"),
        conversation.current,
      );
      conversation.current = result.conversationId;
      setAnswer(result.response);
      setQuestion("");
    } catch {
      setAnswer("Hozir javob olib bo‘lmadi. Keyinroq qayta urinib ko‘ring.");
    } finally {
      setBusy(false);
    }
  }

  async function ticket() {
    if (!client || !answer || busy) return;
    setBusy(true);
    try {
      const result = await client.createSupportTicket(
        "Mini App yordam so‘rovi",
        lastQuestion.current,
        key("ticket"),
      );
      setTickets((current) => [
        result.ticket,
        ...current.filter((item) => item.id !== result.ticket.id),
      ]);
      setAnswer("Support ticket yaratildi. Operator ko‘rib chiqadi.");
    } catch {
      setAnswer("Ticket yaratib bo‘lmadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="support-view" aria-labelledby="support-title">
      <div className="screen-heading">
        <span className="eyebrow">CLOUDFLARE WORKERS AI · BONUS</span>
        <h2 id="support-title">NOVA AI</h2>
        <p>
          Har kuni 5 ta bepul AI javob. Avval FAQ tekshiriladi; hisob ma’lumotlari faqat xavfsiz,
          o‘qish mumkin bo‘lgan vositalar orqali olinadi.
        </p>
      </div>
      <div className="panel support-chat">
        <label htmlFor="support-question">Savolingiz</label>
        <textarea
          id="support-question"
          maxLength={2000}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="NOVA AI’dan biror narsa so‘rang…"
        />
        <button
          className="secondary-button"
          disabled={!client || busy || question.trim().length < 2}
          onClick={() => void ask()}
        >
          {busy ? "KUTILMOQDA…" : "JAVOB OLISH"}
        </button>
        {answer && (
          <div className="support-answer" aria-live="polite">
            <p>{answer}</p>
            <button type="button" disabled={busy} onClick={() => void ticket()}>
              Operatorga yuborish
            </button>
          </div>
        )}
      </div>
      <div className="panel faq-list">
        <span className="label">KO‘P SO‘RALADIGAN SAVOLLAR</span>
        {faq.map((article) => (
          <details key={article.slug}>
            <summary>{article.question}</summary>
            <p>{article.answer}</p>
          </details>
        ))}
      </div>
      <div className="panel ticket-list">
        <span className="label">TICKETLARIM</span>
        {tickets.length ? (
          <ul>
            {tickets.map((item) => (
              <li key={item.id}>
                <strong>{item.subject}</strong>
                <span>{item.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Hozircha ticket yo‘q.</p>
        )}
      </div>
    </section>
  );
}
