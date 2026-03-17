import Link from "next/link";
import CategoryBadge from "./CategoryBadge";
import { Calendar, User } from "lucide-react";

export default function HeroSection({ id, title, excerpt, category, author, date, imageUrl }) {
  return (
    <section className="relative w-full h-[420px] rounded-lg overflow-hidden shadow-md">
      <Link href={`/article/${id}`} className="block h-full group">
        {/* Background image */}
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/0" />

        {/* Text content */}
        <div className="absolute bottom-0 text-white p-6 space-y-3">
          <CategoryBadge category={category} variant="secondary" />

          <h2 className="text-3xl font-bold drop-shadow-lg">{title}</h2>

          <p className="text-sm max-w-2xl opacity-90 line-clamp-3">
            {excerpt}
          </p>

          <div className="flex items-center gap-6 text-xs opacity-80">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>

            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {author}
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
