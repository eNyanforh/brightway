 {/* <section className="bw-design-profile-summary">
        <div className="bw-design-summary-cover" />
        <div className="bw-design-summary-body">
          <Link className="bw-design-summary-photo" to="/profile" aria-label="View profile from sidebar" onClick={onNavigate}>
            <ProfilePicture key={profile?.photo?.id} id={profile?.photo?.id} name={name} decorative />
          </Link>
          <h2>{name}</h2>
          <p>{profile ? profile.headline || "Add your professional headline."
            : profileError ? "Profile summary unavailable." : "Loading your profile…"}</p>
          {location && <small><Icon name="location" />{location}</small>}
          <Link className="bw-design-summary-link" to="/profile" onClick={onNavigate}>View your profile <Icon name="arrow" /></Link>
        </div>
      </section> */}