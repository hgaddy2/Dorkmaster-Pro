import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Hyperlink = ({ href, children, className }: { href: string, children: React.ReactNode, className?: string }) => (
  <a 
    href={href} 
    target="_blank" 
    rel="noopener noreferrer" 
    className={cn("text-[#89CFF0] hover:underline visited:text-gray-500", className)}
  >
    {children}
  </a>
);

export const Button = ({ children, onClick, className, variant = 'primary', disabled }: { children: React.ReactNode, onClick?: () => void, className?: string, variant?: 'primary' | 'secondary' | 'outline' | 'ghost', disabled?: boolean }) => {
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    secondary: "bg-gray-800 hover:bg-gray-700 text-white",
    outline: "border border-gray-700 hover:bg-gray-800 text-white",
    ghost: "hover:bg-gray-800 text-gray-400 hover:text-white"
  };
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={cn("px-4 py-2 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed", variants[variant], className)}
    >
      {children}
    </button>
  );
};

export const Input = ({ value, onChange, placeholder, className, type = 'text' }: { value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder?: string, className?: string, type?: string }) => (
  <input 
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={cn("bg-black border border-gray-800 rounded-md px-4 py-2 text-white focus:outline-none focus:border-blue-500 w-full", className)}
  />
);
