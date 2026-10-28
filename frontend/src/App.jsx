import { Route, Routes } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Home from "../pages/Home";
import Chat from "../pages/Chat";
import ChatDetails from "../pages/ChatDetails";
import Dashboard from "../pages/Dashboard";
import Settings from "../pages/Settings";
import Contact from "../pages/Contact";
import PrivacyPolicy from "../pages/PrivacyPolicy";
import FutureUpdates from "../pages/FutureUpdates";

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/details" element={<ChatDetails />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/updates" element={<FutureUpdates />} />
      </Route>
    </Routes>
  );
}
