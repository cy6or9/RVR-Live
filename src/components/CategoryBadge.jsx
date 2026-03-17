import { Badge } from "@/components/ui/badge";

export default function CategoryBadge({ category, variant = "default" }) {
  return (
    <Badge variant={variant} className="uppercase tracking-wide text-xs px-2 py-0.5">
      {category}
    </Badge>
  );
}
