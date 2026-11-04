import { vi } from "vitest";

// Created once on globalThis so tests keep the same vi.fn() references even after vi.resetModules().
const g = (globalThis.__fbAuthMocks ??= {
  getAuth: vi.fn(),
  RecaptchaVerifier: vi.fn(),
  signInWithPhoneNumber: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn()
});

export const getAuth = g.getAuth;
export const RecaptchaVerifier = g.RecaptchaVerifier;
export const signInWithPhoneNumber = g.signInWithPhoneNumber;
export const onAuthStateChanged = g.onAuthStateChanged;
export const signOut = g.signOut;
export const GoogleAuthProvider = g.GoogleAuthProvider;
export const signInWithPopup = g.signInWithPopup;
export const signInWithEmailAndPassword = g.signInWithEmailAndPassword;
export const createUserWithEmailAndPassword = g.createUserWithEmailAndPassword;
