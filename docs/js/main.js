        // Mobile nav toggle
        const navHamburger = document.querySelector('.nav-hamburger');
        const navMobileMenu = document.querySelector('.nav-mobile-menu');
        if (navHamburger && navMobileMenu) {
            navHamburger.addEventListener('click', () => {
                navMobileMenu.classList.toggle('active');
            });
            navMobileMenu.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    navMobileMenu.classList.remove('active');
                });
            });
        }

        // FAQ Accordion
        document.querySelectorAll('.faq-question').forEach(button => {
            button.addEventListener('click', () => {
                const item = button.parentElement;
                const isActive = item.classList.contains('active');
                
                // Close all
                document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
                
                // Open clicked if wasn't active
                if (!isActive) {
                    item.classList.add('active');
                }
            });
        });

        // Smooth scroll for nav links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
