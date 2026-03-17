import Link from "next/link";
import { Facebook, Twitter, Instagram, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Footer() {
  const about = [
    { name: "About Us", href: "/about" },
    { name: "Contact", href: "/contact" },
    { name: "Advertise", href: "/advertise" },
    { name: "Privacy Policy", href: "/privacy" },
  ];

  const quickLinks = [
    { name: "River Conditions", href: "/river-conditions" },
    { name: "Weather", href: "/weather" },
  ];

  return (
    <footer className="border-t border-border bg-background/80 backdrop-blur text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-lg font-bold mb-4" style={{ color: "#177245" }}>River Valley Report</h3>
            <p className="text-sm text-foreground/70">
              Delivers real-time river conditions, water-level forecasts, and localized weather data for the Ohio River Valley and surrounding waterways. Track current stages, predicted rises and falls, upstream and downstream gauge data, and weather patterns that directly impact river levels — all in one place.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-foreground">About</h4>
            <ul className="space-y-2">
              {about.map((item) => (
                <li key={item.name}>
                  <Link href={item.href}>
                    <span className="text-sm text-foreground/70 hover:text-[hsl(142,70%,35%)] transition-colors inline-block px-2 py-1 -ml-2 rounded-md" data-testid={`link-footer-${item.name.toLowerCase().replace(/\s+/g, '-')}`}>
                      {item.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-foreground">Quick Links</h4>
            <ul className="space-y-2">
              {quickLinks.map((item) => (
                <li key={item.name}>
                  <Link href={item.href}>
                    <span className="text-sm text-foreground/70 hover:text-[hsl(142,70%,35%)] transition-colors inline-block px-2 py-1 -ml-2 rounded-md" data-testid={`link-footer-quick-${item.name.toLowerCase().replace(/\s+/g, '-')}`}>
                      {item.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-foreground">Follow Us</h4>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="text-foreground/70 hover:text-[hsl(142,70%,35%)]" data-testid="button-social-facebook">
                <Facebook className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-foreground/70 hover:text-[hsl(142,70%,35%)]" data-testid="button-social-twitter">
                <Twitter className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-foreground/70 hover:text-[hsl(142,70%,35%)]" data-testid="button-social-instagram">
                <Instagram className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-foreground/70 hover:text-[hsl(142,70%,35%)]" data-testid="button-social-email">
                <Mail className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-border text-center text-sm text-foreground/70">
          <p>&copy; {new Date().getFullYear()} River Valley Report. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
