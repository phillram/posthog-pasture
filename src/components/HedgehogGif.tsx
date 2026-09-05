"use client";

const hedgehogGifs = [
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3VhaWgzM2Y3bWFtYWJsZG1rZG0xaTQzamdwdTNndnI4Yno2OHZvdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/6WCTG9Qt1CL28/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3VhaWgzM2Y3bWFtYWJsZG1rZG0xaTQzamdwdTNndnI4Yno2OHZvdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/UlFMuMlD4V3z6v36YC/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3VhaWgzM2Y3bWFtYWJsZG1rZG0xaTQzamdwdTNndnI4Yno2OHZvdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/aRUzQgxa63Ali/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3VhaWgzM2Y3bWFtYWJsZG1rZG0xaTQzamdwdTNndnI4Yno2OHZvdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3xz2BCohVTd7h2Kvfi/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3VhaWgzM2Y3bWFtYWJsZG1rZG0xaTQzamdwdTNndnI4Yno2OHZvdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QQgcoDDK95Qdy/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Y2pmY2Fsd3B0NHpsZGd2NnRkNGk2ZmtrdjljY215MXJnaGxlMGFwMyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/KmELrTPAgL3Qk/giphy.gif",
];

interface HedgehogGifProps {
  /** Which GIF to show. The index wraps, so any whole number works. */
  index: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// These stay on a plain <img>. next/image sends a GIF through the optimizer,
// and the optimizer removes the animation.
export default function HedgehogGif({ index, size = "md", className = "" }: HedgehogGifProps) {
  const gifIndex = index % hedgehogGifs.length;
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-32 h-32",
    lg: "w-48 h-48",
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={hedgehogGifs[gifIndex]}
      alt="Cute hedgehog"
      className={`${sizeClasses[size]} rounded-lg object-cover ${className}`}
    />
  );
}

export function HedgehogBanner() {
  return (
    <div className="flex gap-3 justify-center items-center py-4 overflow-hidden">
      {hedgehogGifs.slice(0, 4).map((gif, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={gif}
          alt="Hedgehog"
          className="w-20 h-20 rounded-lg object-cover opacity-80 hover:opacity-100 hover:scale-110 transition-all duration-300"
        />
      ))}
    </div>
  );
}
