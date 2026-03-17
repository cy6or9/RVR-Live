// /src/components/FavoriteButton.jsx
// Reusable favorite button component
import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/context/UserProfileContext";
import { useAuth } from "@/context/AuthContext";

export default function FavoriteButton({
  type = "locksDams", // 'locksDams' | 'towns' | 'marinas'
  itemId,
  itemName,
  className = "",
  variant = "ghost",
  size = "sm",
  showTooltip = true,
}) {
  const { user } = useAuth();
  const { checkIsFavorite, toggleFavorite } = useUserProfile();
  const [isAnimating, setIsAnimating] = useState(false);

  const isFavorited = checkIsFavorite(type, itemId);

  const handleClick = async (e) => {
    e.stopPropagation(); // Prevent event bubbling
    
    if (!user) {
      alert("Please sign in to save favorites");
      return;
    }

    setIsAnimating(true);
    await toggleFavorite(type, itemId);
    
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={`${className} ${isAnimating ? "scale-125" : ""} transition-all`}
      title={
        showTooltip
          ? isFavorited
            ? `Remove ${itemName} from favorites`
            : `Add ${itemName} to favorites`
          : undefined
      }
    >
      <Star
        className={`w-4 h-4 transition-all ${
          isFavorited ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
        }`}
      />
    </Button>
  );
}
