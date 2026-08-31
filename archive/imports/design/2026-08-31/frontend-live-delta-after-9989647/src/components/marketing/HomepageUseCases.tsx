import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CircleGauge,
  Globe2,
  Mail,
  MailCheck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { StraleMark } from "../StraleMark";

type UseCaseTool = {
  label: string;
  slug: string;
};

type UseCase = {
  id: string;
  title: string;
  description: string;
  tools: UseCaseTool[];
  imageSrc: string;
  imageAlt: string;
  tone: "cobalt" | "mineral" | "spectrum";
};

const enrichmentTools = [
  {
    label: "Company classification",
    Icon: Building2,
  },
  {
    label: "Published contacts",
    Icon: Users,
  },
  {
    label: "Email validation",
    Icon: MailCheck,
  },
  {
    label: "Email reputation",
    Icon: CircleGauge,
  },
];

const useCases: UseCase[] = [
  {
    id: "market-research",
    title: "Market research",
    description: "Build a market view from more than a search page. Bring together web results, current news, economic indicators, hiring activity and patent signals before your agent compares opportunities.",
    tools: [
      { label: "Search the live web", slug: "google-search" },
      { label: "Follow current news", slug: "google-news-search" },
      { label: "Compare economies", slug: "country-economic-indicators" },
      { label: "Track hiring demand", slug: "job-board-search" },
      { label: "Review patent activity", slug: "patent-search" },
    ],
    imageSrc: "/images/use-cases/market-research.webp",
    imageAlt: "Search, news, economic, hiring and patent signals connecting into a global market view",
    tone: "cobalt",
  },
  {
    id: "document-intelligence",
    title: "Document intelligence",
    description: "Move information out of PDFs, scans, invoices and web pages without building a parser for every format. Strale can extract text and structured fields, ready for classification or review.",
    tools: [
      { label: "Read images and scans", slug: "image-to-text" },
      { label: "Extract PDF content", slug: "pdf-extract" },
      { label: "Structure invoice data", slug: "invoice-extract" },
      { label: "Clean web pages", slug: "url-to-markdown" },
    ],
    imageSrc: "/images/use-cases/document-intelligence.webp",
    imageAlt: "Scanned documents, receipts and web pages flowing through extraction into structured information",
    tone: "mineral",
  },
  {
    id: "counterparty-verification",
    title: "Counterparty verification",
    description: "Check counterparties across borders with the signals each decision needs. Combine screening, identifier validation, bank-account structure and company matching while keeping every check bounded and reviewable.",
    tools: [
      { label: "Screen sanctions", slug: "sanctions-check" },
      { label: "Check PEP exposure", slug: "pep-check" },
      { label: "Validate bank details", slug: "iban-validate" },
      { label: "Validate tax identifiers", slug: "tax-id-validate" },
      { label: "Match company names", slug: "company-name-match" },
    ],
    imageSrc: "/images/use-cases/counterparty-verification.webp",
    imageAlt: "Multiple screening, identity, bank and company checks converging into one review-ready counterparty record",
    tone: "spectrum",
  },
];

function EnrichmentUseCase() {
  return (
    <article className="sv-use-featured" aria-labelledby="sv-use-title-prospect-enrichment">
      <div className="sv-use-featured-footer">
        <div className="sv-use-featured-copy">
          <h3 id="sv-use-title-prospect-enrichment">Prospect enrichment</h3>
          <p>
            Turn scattered company, domain and email fragments into reviewable prospect context your agent can act on.
          </p>
          <Link className="sv-ci-copy-link sv-use-featured-link" to="/capabilities">
            Browse enrichment tools <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>

        <div className="sv-use-featured-tools">
          <ul aria-label="Prospect enrichment capabilities">
            {enrichmentTools.map(({ label, Icon }) => (
              <li key={label}>
                <span><Icon size={17} /></span>
                <strong>{label}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className="sv-use-featured-visual"
        role="img"
        aria-label="An illustrative prospect-enrichment workflow combines company classification, published business contacts, email validation and email reputation into one agent-controlled context."
      >
        <div className="sv-use-enrich-input" aria-hidden="true">
          <div className="sv-use-input-stack">
            <div className="sv-use-input-card">
              <span><Building2 size={19} /></span>
              <div><small>Company</small><strong>Acme Inc.</strong></div>
            </div>
            <div className="sv-use-input-card">
              <span><Globe2 size={19} /></span>
              <div><small>Domain</small><strong>acme.com</strong></div>
            </div>
            <div className="sv-use-input-card">
              <span><Mail size={19} /></span>
              <div><small>Email</small><strong>jane@acme.com</strong></div>
            </div>
          </div>
        </div>

        <div className="sv-use-enrich-bridge" aria-hidden="true">
          <span className="sv-use-bridge-line sv-use-bridge-line--in" />
          <span className="sv-use-transform-node"><StraleMark size={20} /></span>
          <span className="sv-use-bridge-line sv-use-bridge-line--out" />
        </div>

        <div className="sv-use-enrich-output" aria-hidden="true">
          <div className="sv-use-output-card">
            <header>
              <span className="sv-use-output-mark"><Building2 size={21} /></span>
              <div>
                <h4>Acme Inc.</h4>
                <small>acme.com</small>
              </div>
            </header>

            <div className="sv-use-output-list">
              <div>
                <span><Building2 size={19} /></span>
                <div><small>Company classification</small><strong>Software · high confidence</strong></div>
                <CheckCircle2 size={17} />
              </div>
              <div>
                <span><Users size={19} /></span>
                <div><small>Published contacts</small><strong>Role email · phone · social</strong></div>
                <CheckCircle2 size={17} />
              </div>
              <div>
                <span><MailCheck size={19} /></span>
                <div><small>Email assessment</small><strong>Valid format · MX found · low risk</strong></div>
                <CheckCircle2 size={17} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function HomepageUseCases() {
  return (
    <section className="sv-use-cases" id="use-cases" aria-labelledby="sv-use-cases-title">
      <div className="sv-use-cases-heading">
        <p className="sv-eyebrow">Use cases</p>
        <h2 id="sv-use-cases-title">What agents use Strale for.</h2>
        <p>Combine specialised tools behind one connection to enrich prospects, research markets, understand documents and verify counterparties.</p>
      </div>

      <div className="sv-use-sequence">
        <EnrichmentUseCase />

        {useCases.map((useCase, index) => {
          const itemNumber = index + 2;
          return (
            <article
              className="sv-use-chapter"
              data-side={itemNumber % 2 === 0 ? "art-first" : "copy-first"}
              aria-labelledby={`sv-use-title-${useCase.id}`}
              key={useCase.id}
            >
              <div className="sv-use-chapter-copy">
                <h3 id={`sv-use-title-${useCase.id}`}>{useCase.title}</h3>
                <p className="sv-use-description">{useCase.description}</p>

                <div className="sv-use-toolset">
                  <p>Built from specialised tools</p>
                  <ul>
                    {useCase.tools.map((tool, toolIndex) => (
                      <li key={tool.slug}>
                        <span>{String(toolIndex + 1).padStart(2, "0")}</span>
                        <div><strong>{tool.label}</strong><code>{tool.slug}</code></div>
                        <Check size={15} aria-hidden="true" />
                      </li>
                    ))}
                  </ul>
                </div>

                <Link className="sv-ci-copy-link sv-use-link" to="/capabilities">
                  Browse capabilities <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>

              <div className="sv-use-illustration" data-tone={useCase.tone}>
                <img src={useCase.imageSrc} alt={useCase.imageAlt} loading="lazy" decoding="async" />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
