const photos = {
  profile: {
    file: "individuals",
    alt: "A woman working with a laptop in a bright office.",
    photographer: "Christina Morillo",
    source: "https://www.pexels.com/photo/photography-of-woman-using-laptop-1181727/",
    width: 1440,
    height: 960,
  },
  school: {
    file: "schools",
    alt: "Three students in school uniforms standing together at their classroom window.",
    photographer: "Andy Coffie",
    source: "https://www.pexels.com/photo/smiling-african-students-inside-classroom-36830932/",
    width: 1440,
    height: 1029,
  },
  partners: {
    file: "partners",
    alt: "Colleagues discussing documents and charts together around an office table.",
    photographer: "Alena Darmel",
    source: "https://www.pexels.com/photo/a-group-of-people-having-a-meeting-in-the-office-7710140/",
    width: 1440,
    height: 960,
  },
};

export default function MarketingVisual({ kind = "profile" }) {
  const photo = photos[kind] || photos.profile;
  const folder = `${import.meta.env.BASE_URL}images/hero`;
  return (
    <figure className={`bw-marketing-photo bw-marketing-photo-${photo.file}`}>
      <img
        src={`${folder}/${photo.file}-1440.webp`}
        srcSet={`${folder}/${photo.file}-720.webp 720w, ${folder}/${photo.file}-1440.webp 1440w`}
        sizes="(max-width: 650px) calc(100vw - 58px), (max-width: 850px) 42vw, (max-width: 1280px) 43vw, 522px"
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
      <figcaption>
        Photo: <a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.photographer} / Pexels</a>
      </figcaption>
    </figure>
  );
}
