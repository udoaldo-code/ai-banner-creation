import { twMerge } from "tailwind-merge";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={twMerge("rounded-xl border border-gray-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={twMerge("px-6 py-4 border-b border-gray-100", className)}>{children}</div>
  );
}

export function CardContent({ children, className }: CardProps) {
  return <div className={twMerge("px-6 py-4", className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardProps) {
  return (
    <div className={twMerge("px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl", className)}>
      {children}
    </div>
  );
}
