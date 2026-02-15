import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { ChevronLeft, ChevronRight} from "lucide-react";

const Container = styled.div`
  background: linear-gradient(135deg, #e2f39dff, #67b4f3ff); 
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  margin-bottom: 20px;
  font-family:"Inter"
`;

const Header = styled.div`
  margin-bottom: 14px;
  text-align: center;

  h2 { margin: 0; font-size: 1.4rem; font-weight: 700; color: #0f172a; }
  p { margin: 4px 0 0; font-size: 0.9rem; color: #475569; }
`;

const SliderWrapper = styled.div`
  display: flex;
  align-items: center;
  position: relative;
`;

const NavButton = styled.button`
  background: rgb(0,0,0);
  border: 2px solid rgba(255,255,255,0.3);
  // backdrop-filter: blur(6px);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  transition: 0.2s;

  &:hover {
    background: rgba(255,255,255,0.4);
    transform: translateY(-50%) scale(1.05);
  }
`;

const PrevButton = styled(NavButton)` left: 15px;z-index:2;color:white;font-size:2rem`;
const NextButton = styled(NavButton)` right: 15px; color:white `;

const Slider = styled.div`
  display: flex;
  overflow: hidden;
  width: 100%;
`;

const Card = styled.div`
  flex: 0 0 100%;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(10px);
  border-radius: 14px;
  border: 4px solid rgba(255,255,255,0.25);
  // padding: 14px;
  margin: 0 auto;
  box-shadow: 0 4px 14px rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;

  img {
    width: 100%;
    height: 250px;
    border-radius: 10px;
    object-fit: cover;
    // margin-bottom: 8px;
  }

  h4 { margin: 0 0 4px 0; font-size: 1rem; font-weight: 600; color: #0f172a; }
  p { margin: 0 0 8px 0; font-size: 0.8rem; color: #334155; line-height: 1.3; }
`;

// const Meta = styled.div`
//   display: flex;
//   justify-content: space-between;
//   font-size: 0.8rem;
//   margin-top: auto;
//   padding-top: 6px;
//   border-top: 1px solid rgba(255,255,255,0.4);

//   div { display: flex; align-items: center; gap: 4px; font-weight: 500; color: #0f172a; }
// `;

// const Sponsor = styled.div`
//   margin-top: 6px;
//   font-size: 0.75rem;
//   display: flex;
//   align-items: center;
//   gap: 4px;
//   color: #475569;
// `;

const challenges = [
  { title: "React Hackathon 2025", desc: "Build the best React app in 48h!", prize: "$2,000", deadline: 7, sponsor: "Orange Liberia", img: "https://cdn2.goodwall.io/images/0/0-1755543356227-106281.png?width=1080" },
  { title: "Data Science Challenge", desc: "Predict trends using public datasets.", prize: "$3,500", deadline: 12, sponsor: "Google AI", img: "https://cdn2.goodwall.io/images/0/0-1741188407976-306160.png?width=1080" },
  { title: "UX Design Sprint", desc: "Design an app interface in 24h.", prize: "$1,000", deadline: 3, sponsor: "Adobe XD", img: "https://cdn2.goodwall.io/images/0/0-1758220066861-41536.png?width=1080" },
];

export default function ChallengeSlider() {
  const [index, setIndex] = useState(0);

  const nextSlide = () => setIndex((prev) => (prev + 1) % challenges.length);
  const prevSlide = () => setIndex((prev) => (prev - 1 + challenges.length) % challenges.length);

  // Automatic slide every 5 seconds
  useEffect(() => {
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Container>
      <Header>
        <h2>Join Challenges</h2>
        <p>Partake to earn money</p>
      </Header>
      <SliderWrapper>
        <PrevButton onClick={prevSlide}><ChevronLeft size={16}/></PrevButton>
        <Slider>
          {challenges.slice(index, index + 1).map((c, i) => (
            <Card key={i}>
              <img src={c.img} alt={c.title} />
              {/* <h4>{c.title}</h4>
              <p>{c.desc}</p> */}
              {/* <Meta>
                <div><Trophy size={14}/> {c.prize}</div>
                <div><Clock size={14}/> {c.deadline} days</div>
              </Meta> */}
              {/* <Sponsor><Building2 size={12}/> Sponsored by {c.sponsor}</Sponsor> */}
            </Card>
          ))}
        </Slider>
        <NextButton onClick={nextSlide}><ChevronRight size={16}/></NextButton>
      </SliderWrapper>
    </Container>
  );
}
