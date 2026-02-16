import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ForSchools from "./pages/ForSchool";
import Partner from "./pages/Partner";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/schools" element={<ForSchools />} />
        <Route path="/partner" element={<Partner />} />
       
      </Routes>
    </BrowserRouter>
  );
}

export default App;
