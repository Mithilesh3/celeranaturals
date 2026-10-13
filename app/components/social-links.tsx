import type { ReactNode } from "react";

export type SocialLink = { name: string; href: string; icon: ReactNode };

// Adding a platform is a single entry here; the footer renders whatever it finds.
// Icons are inline SVG on a 20x20 viewBox and use currentColor so they inherit
// the link colour (including the hover and focus states).
export const SOCIAL_LINKS: SocialLink[] = [
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/company/celera-healthcare/",
    icon: (
      <path d="M3.6 1.7a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM1.9 18.3h3.4V7.2H1.9v11.1Zm5.5 0h3.4v-5.8c0-1.5.4-2.9 2.2-2.9 1.8 0 1.9 1.6 1.9 3v5.7h3.4v-6.4c0-2.9-.7-5.1-4-5.1-1.6 0-2.7.9-3.2 1.7h-.1V7.2H7.4v11.1Z" />
    ),
  },
  {
    name: "Instagram",
    href: "https://www.instagram.com/celerahealthcare/",
    icon: (
      <path
        fillRule="evenodd"
        d="M6.4 1.7h7.2a4.7 4.7 0 0 1 4.7 4.7v7.2a4.7 4.7 0 0 1-4.7 4.7H6.4a4.7 4.7 0 0 1-4.7-4.7V6.4a4.7 4.7 0 0 1 4.7-4.7Zm0 1.8A2.9 2.9 0 0 0 3.5 6.4v7.2a2.9 2.9 0 0 0 2.9 2.9h7.2a2.9 2.9 0 0 0 2.9-2.9V6.4a2.9 2.9 0 0 0-2.9-2.9H6.4ZM10 5.9a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Zm0 1.8a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Zm4.5-2.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z"
      />
    ),
  },
  {
    name: "Facebook",
    // Share-style link supplied by the business. Swap for the canonical
    // facebook.com/<pagename> URL once the page's vanity handle is available.
    href: "https://www.facebook.com/share/XKxYyfVqhWJssW5y/?mibextid=qi2Omg",
    icon: (
      <path d="M11.4 18.3v-7.5h2.5l.4-2.9h-2.9V6c0-.84.24-1.41 1.45-1.41h1.54V2a20.4 20.4 0 0 0-2.25-.12c-2.23 0-3.75 1.36-3.75 3.86v2.15H5.9v2.9h2.49v7.5h3.01Z" />
    ),
  },
];
